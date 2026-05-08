import {getDb} from "../config/database";
import {logger} from "../config/logger";

import type {Migration} from "./index";

/**
 * Agrega los settings de unidades (weightUnit, dimensionUnit, volumeUnit,
 * temperatureUnit) a las organizations que aún no los tienen, con defaults
 * métricos.
 *
 * Idempotente: solo afecta orgs que carecen de cualquiera de los 4 campos.
 *
 * Rollback manual:
 *   db.organizations.updateMany(
 *     {},
 *     { $unset: {
 *         'settings.weightUnit': '',
 *         'settings.dimensionUnit': '',
 *         'settings.volumeUnit': '',
 *         'settings.temperatureUnit': '',
 *     }}
 *   );
 *   db._migrations.deleteOne({ name: '002-organizations-unit-settings' });
 */
async function up(): Promise<void> {
	const db = getDb();
	const collection = db.collection("organizations");

	const result = await collection.updateMany(
		{
			$or: [
				{"settings.weightUnit": {$exists: false}},
				{"settings.dimensionUnit": {$exists: false}},
				{"settings.volumeUnit": {$exists: false}},
				{"settings.temperatureUnit": {$exists: false}},
			],
		},
		{
			$set: {
				"settings.weightUnit": "kg",
				"settings.dimensionUnit": "m",
				"settings.volumeUnit": "m3",
				"settings.temperatureUnit": "C",
				updatedAt: new Date(),
			},
		},
	);

	logger.info(
		{matched: result.matchedCount, modified: result.modifiedCount},
		"002-organizations-unit-settings — completado",
	);
}

export const migration: Migration = {
	name: "002-organizations-unit-settings",
	up,
};
