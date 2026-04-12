import pinoHttp from "pino-http";

import {createApp} from "./app";
import {connectDatabase, disconnectDatabase} from "./config/database";
import {env} from "./config/env";
import { httpLoggerOptions } from "./config/http-logger";
import {logger} from "./config/logger";
import {getRedisClient, disconnectRedis} from "./config/redis";
import { registerEmployeeAlertsJob } from "./infrastructure/jobs/employee.alerts.job";
import {initGoogleStrategy} from "./modules/auth/strategies/google.strategy";
import {initMicrosoftStrategy} from "./modules/auth/strategies/microsoft.strategy";
import { createDocumentCatalogIndexes } from './modules/hr/document-catalog.model';
import { createNotificationIndexes } from "./modules/notifications/notification.model";
import { createOrganizationIndexes } from "./modules/organizations/organization.model";
import { createRoleIndexes } from "./modules/roles/role.model";
import { seedRoles } from "./modules/roles/role.seed";
import { createTaskIndexes } from './modules/tasks/task.model';
import { createTokenIndexes } from "./modules/tokens/token.model";
import { createUserIndexes } from "./modules/users/user.model";

async function bootstrap(): Promise<void> {
	//  Conectar base de datos
	await connectDatabase();

	// Índices — orden no importa, son independientes
  await Promise.all( [ createUserIndexes(), createOrganizationIndexes(), createRoleIndexes(), createTokenIndexes() , createTaskIndexes(), createNotificationIndexes(), createDocumentCatalogIndexes(), registerEmployeeAlertsJob()] );
  
  // Seed — crea o actualiza roles del sistema
  await seedRoles();

	// Inicializar OIDC strategies en paralelo
	await Promise.all([initGoogleStrategy(), initMicrosoftStrategy()]);

	// Inicializar Redis
	getRedisClient();

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
