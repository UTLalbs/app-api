import {getDb} from "../config/database";
import {logger} from "../config/logger";

import type {Migration} from "./index";

/**
 * Inicializa el campo `photos` en los remolques que aún no lo tienen, con los
 * 4 slots fijos en null (leftSide, rightSide, rear, couplingFront).
 *
 * Idempotente: el filter excluye documentos que ya tengan `photos`.
 *
 * Rollback manual:
 *   db.trailers.updateMany({}, { $unset: { photos: '' } });
 *   db._migrations.deleteOne({ name: '003-trailers-photos-init' });
 */
async function up(): Promise<void> {
	const db = getDb();
	const collection = db.collection("trailers");

	const result = await collection.updateMany(
		{photos: {$exists: false}},
		{
			$set: {
				photos: {
					leftSide: null,
					rightSide: null,
					rear: null,
					couplingFront: null,
				},
				updatedAt: new Date(),
			},
		},
	);

	logger.info(
		{matched: result.matchedCount, modified: result.modifiedCount},
		"003-trailers-photos-init — completado",
	);
}

export const migration: Migration = {
	name: "003-trailers-photos-init",
	up,
};
