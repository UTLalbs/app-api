import cron from "node-cron";

import {logger} from "../../config/logger";
import {deleteFile, listObjects} from "../../infrastructure/storage/s3.service";

const DRAFT_PREFIX = "units-pending/";

const MAX_DRAFT_AGE_HOURS = 24;

export async function runUnitDraftsCleanupJob(): Promise<void> {
	logger.info("🧹 Unit drafts cleanup job started");

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
			"✅ Unit drafts cleanup complete",
		);
	} catch (err) {
		logger.error({err}, "❌ Unit drafts cleanup job failed");
	}
}

export function registerUnitDraftsCleanupJob(): void {
	// Cron diario a las 3:35 AM (después del trailer-drafts-cleanup que va 3:30)
	cron.schedule("35 3 * * *", () => {
		runUnitDraftsCleanupJob().catch((err) =>
			logger.error({err}, "Unit drafts cleanup cron failed"),
		);
	});

	logger.info(
		`✅  Unit drafts cleanup job registered — runs daily at 3:35 AM, TTL ${MAX_DRAFT_AGE_HOURS}h`,
	);
}
