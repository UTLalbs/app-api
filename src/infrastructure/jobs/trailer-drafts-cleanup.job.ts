import cron from "node-cron";

import {logger} from "../../config/logger";
import {deleteFile, listObjects} from "../../infrastructure/storage/s3.service";

const DRAFT_PREFIX = "trailers-pending/";

// Drafts subidos en /extract pero abandonados (usuario cerró el wizard sin
// crear el trailer) se borran después de este TTL.
const MAX_DRAFT_AGE_HOURS = 24;

export async function runTrailerDraftsCleanupJob(): Promise<void> {
	logger.info("🧹 Trailer drafts cleanup job started");

	try {
		const objects = await listObjects(DRAFT_PREFIX);
		const cutoff = Date.now() - MAX_DRAFT_AGE_HOURS * 60 * 60 * 1000;

		let deleted = 0;
		let kept = 0;

		for (const obj of objects) {
			if (obj.lastModified.getTime() < cutoff) {
				try {
					await deleteFile(obj.key);
					deleted++;
				} catch (err) {
					logger.warn({err, key: obj.key}, "Failed to delete stale draft");
				}
			} else {
				kept++;
			}
		}

		logger.info(
			{total: objects.length, deleted, kept, ttlHours: MAX_DRAFT_AGE_HOURS},
			"✅ Trailer drafts cleanup complete",
		);
	} catch (err) {
		logger.error({err}, "❌ Trailer drafts cleanup job failed");
	}
}

export function registerTrailerDraftsCleanupJob(): void {
	// Cron diario a las 3:30 AM (después del de catalogs-sync que va a las 3:00)
	cron.schedule("30 3 * * *", () => {
		runTrailerDraftsCleanupJob().catch((err) =>
			logger.error({err}, "Trailer drafts cleanup cron failed"),
		);
	});

	logger.info(
		`✅  Trailer drafts cleanup job registered — runs daily at 3:30 AM, TTL ${MAX_DRAFT_AGE_HOURS}h`,
	);
}
