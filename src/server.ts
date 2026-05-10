import pinoHttp from "pino-http";

import {createApp} from "./app";
import {connectDatabase, disconnectDatabase} from "./config/database";
import {env} from "./config/env";
import {httpLoggerOptions} from "./config/http-logger";
import {logger} from "./config/logger";
import {getRedisClient, disconnectRedis} from "./config/redis";
import {runPendingMigrations} from "./migrations/migrationRunner";
import {registerAuditArchiveJob} from "./infrastructure/jobs/audit-archive.job";
import {closeAuditQueue} from "./infrastructure/jobs/audit.queue";
import {startAuditWorker, stopAuditWorker} from "./infrastructure/jobs/audit.worker";
import {registerCatalogsSyncJob, runCatalogsSync} from "./infrastructure/jobs/catalogs-sync.job";
import {registerEmployeeAlertsJob} from "./infrastructure/jobs/employee.alerts.job";
import {registerTrailerAlertsJob} from "./infrastructure/jobs/trailer-alerts.job";
import {registerTrailerDraftsCleanupJob} from "./infrastructure/jobs/trailer-drafts-cleanup.job";
import {registerUnitAlertsJob} from "./infrastructure/jobs/unit-alerts.job";
import {registerUnitDraftsCleanupJob} from "./infrastructure/jobs/unit-drafts-cleanup.job";
import {createBusinessPartnersIndexes} from "./modules/business-partners/business-partners.model";
import {createTrailerIndexes} from "./modules/trailers/trailers.model";
import {createUnitIndexes} from "./modules/units/units.model";
import {initGoogleStrategy} from "./modules/auth/strategies/google.strategy";
import {initMicrosoftStrategy} from "./modules/auth/strategies/microsoft.strategy";
import {createAbsenceIndexes} from "./modules/hr/absences/absence.model";
import {createDepartmentIndexes} from "./modules/hr/departments/department.model";
import {createDocumentCatalogIndexes} from "./modules/hr/document-catalog/document-catalog.model";
import {createDocumentProfileIndexes} from "./modules/hr/document-profiles/document-profile.model";
import {createPositionIndexes} from "./modules/hr/positions/position.model";
import {createScheduleIndexes} from "./modules/hr/schedules/schedule.model";
import {createTimeClockIndexes} from "./modules/hr/time-clocks/time-clock.model";
import {createLocationIndexes} from "./modules/locations/location.model";
import {createNotificationIndexes} from "./modules/notifications/notification.model";
import {findAllOrganizations} from "./modules/organizations/organization.repository";
import {createOrganizationIndexes} from "./modules/organizations/organization.model";
import {seedAbsenceCategoriesForOrg} from "./modules/hr/absences/absence-category.seed";
import {ensureOrgAdminRole} from "./modules/roles/role.admin.service";
import {createRoleIndexes} from "./modules/roles/role.model";
import {seedRoles} from "./modules/roles/role.seed";
import {createTaskIndexes} from "./modules/tasks/task.model";
import {createTokenIndexes} from "./modules/tokens/token.model";
import {createUserIndexes} from "./modules/users/user.model";

async function bootstrap(): Promise<void> {
	//  Conectar base de datos
	await connectDatabase();

	// Migraciones — corren antes de índices y seeds. Idempotentes.
	// Soporta MIGRATION_DRY_RUN=true para preview sin tocar datos.
	await runPendingMigrations();

	// Índices — orden no importa, son independientes
	await Promise.all([
		createUserIndexes(),
		createOrganizationIndexes(),
		createRoleIndexes(),
		createTokenIndexes(),
		createTaskIndexes(),
		createNotificationIndexes(),
		createDocumentCatalogIndexes(),
		createDocumentProfileIndexes(),
		createPositionIndexes(),
		createDepartmentIndexes(),
		createLocationIndexes(),
		createScheduleIndexes(),
		createAbsenceIndexes(),
		createTimeClockIndexes(),
		createBusinessPartnersIndexes(),
		createTrailerIndexes(),
		createUnitIndexes(),
		registerEmployeeAlertsJob(),
		registerTrailerAlertsJob(),
		registerTrailerDraftsCleanupJob(),
		registerUnitAlertsJob(),
		registerUnitDraftsCleanupJob(),
	]);

	// Seed — crea o actualiza roles del sistema
	await seedRoles();

	// Resync de roles admin per-org. Idempotente: si los permisos del catálogo
	// (MODULE_RESOURCES / MODULE_CATALOG) cambian — p. ej. al sumar un módulo
	// nuevo como `absences` — esto refleja los nuevos permisos en el rol admin
	// de cada org sin requerir intervención manual.
	const orgs = await findAllOrganizations();
	let resynced = 0;
	let skipped = 0;
	await Promise.all(
		orgs.map(async (o) => {
			const features = o.settings?.features;
			if (!features) {
				skipped++;
				logger.warn(
					{orgId: o.id, orgName: o.name},
					"Org sin settings.features — admin role no resync",
				);
				return;
			}
			try {
				await ensureOrgAdminRole(o.id, features);
				resynced++;
			} catch (err) {
				skipped++;
				logger.error({err, orgId: o.id}, "Failed to resync admin role");
			}
		}),
	);
	logger.info(
		{resynced, skipped, total: orgs.length},
		"✅  Org admin roles resynced",
	);

	// Resync de catálogo de categorías de ausencias para orgs existentes.
	// Idempotente: el seed usa upsert + isSystem para no pisar customs ni el
	// flag isActive cuando ya existían.
	let absenceSeeded = 0;
	let absenceSkipped = 0;
	await Promise.all(
		orgs.map(async (o) => {
			if (!o.settings?.features) {
				absenceSkipped++;
				return;
			}
			try {
				await seedAbsenceCategoriesForOrg(o.id);
				absenceSeeded++;
			} catch (err) {
				absenceSkipped++;
				logger.error(
					{err, orgId: o.id},
					"Failed to seed absence categories",
				);
			}
		}),
	);
	logger.info(
		{seeded: absenceSeeded, skipped: absenceSkipped, total: orgs.length},
		"✅  Absence categories resynced",
	);

	// Inicializar OIDC strategies en paralelo
	await Promise.all([initGoogleStrategy(), initMicrosoftStrategy()]);

	// Inicializar Redis
	getRedisClient();

	// Arrancar worker de auditoría — consume la cola BullMQ y escribe en Mongo
	startAuditWorker();

	// Registrar job diario que archiva audits viejos a S3 Glacier antes de que
	// el TTL los borre. No-op si AUDIT_ARCHIVE_BUCKET no está configurado.
	registerAuditArchiveJob();

	// Registrar cron diario de sync de catálogos SAT (03:00 UTC). Adicionalmente
	// dispara una sync inicial en background para warm-up del cache si está vacío.
	registerCatalogsSyncJob();
	void runCatalogsSync();

	// Crear app Express
	const app = createApp(pinoHttp(httpLoggerOptions));

	// Middleware de logging HTTP (pino-http)
	app.use(pinoHttp(httpLoggerOptions));

	// Levantar servidor HTTP
	const server = app.listen(env.PORT, () => {
		logger.info(`🚀  Server running on port ${env.PORT} [${env.NODE_ENV}]`);
	});

	async function shutdown(signal: string): Promise<void> {
		logger.info(`${signal} received — shutting down gracefully...`);

		server.close(async () => {
			try {
				await stopAuditWorker();
				await closeAuditQueue();
				await disconnectDatabase();
				await disconnectRedis();
				logger.info("Graceful shutdown complete");
				process.exit(0);
			} catch (err) {
				logger.error({err}, "Error during shutdown");
				process.exit(1);
			}
		});

		setTimeout(() => {
			logger.error("Forced shutdown after timeout");
			process.exit(1);
		}, 10_000);
	}

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	process.on("unhandledRejection", (reason) => {
		logger.fatal({reason}, "Unhandled Promise rejection");
		process.exit(1);
	});

	process.on("uncaughtException", (err) => {
		logger.fatal({err}, "Uncaught exception");
		process.exit(1);
	});
}

bootstrap();
