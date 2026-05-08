import cron from "node-cron";

import {logger} from "../../config/logger";
import {syncAllSatCatalogs} from "../../modules/catalogs/catalogs.service";

/**
 * Refresca todos los catálogos SAT cacheados en Redis. Se llama por el cron y
 * también puede invocarse manualmente al boot para warm-up.
 */
export async function runCatalogsSync(): Promise<void> {
	logger.info("▶  Running SAT catalogs sync");
	const startedAt = Date.now();
	try {
		const result = await syncAllSatCatalogs();
		logger.info(
			{
				synced: result.synced,
				failed: result.failed,
				durationMs: Date.now() - startedAt,
			},
			"✅  SAT catalogs sync complete",
		);
	} catch (err) {
		// No debe propagar — el cron se vuelve a ejecutar mañana.
		logger.error({err}, "Unhandled error in SAT catalogs sync");
	}
}

/**
 * Registra el cron diario. Idempotente: si ya hay un schedule registrado para
 * la misma expresión, node-cron lo añade — pero como solo se llama una vez al
 * boot, no es problema.
 *
 * Corre todos los días a las 03:00 UTC, igual que el archive de auditoría.
 */
export function registerCatalogsSyncJob(): void {
	cron.schedule(
		"0 3 * * *",
		() => {
			runCatalogsSync().catch((err) =>
				logger.error({err}, "Unhandled error in catalogs-sync cron"),
			);
		},
		{timezone: "UTC"},
	);

	logger.info("✅  Catalogs sync job registered (daily 03:00 UTC)");
}
