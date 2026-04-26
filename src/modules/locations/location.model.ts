import type {Collection} from "mongodb";

import {getDb} from "../../config/database";
import {logger} from "../../config/logger";

import type {LocationDocument} from "./location.types";

export function getLocationCollection(): Collection<LocationDocument> {
	return getDb().collection<LocationDocument>("locations");
}

export async function createLocationIndexes(): Promise<void> {
	const collection = getLocationCollection();

	await collection.createIndexes([
		{key: {orgId: 1, name: 1}, name: "orgId_name"},
		{key: {orgId: 1, isActive: 1}, name: "orgId_isActive"},
		{key: {orgId: 1, clientId: 1}, name: "orgId_clientId", sparse: true},
		{
			key: {orgId: 1, idOrigenDestino: 1},
			name: "orgId_idOrigenDestino_unique",
			unique: true,
			sparse: true,
		},
		// Búsqueda por nombre/descripción se hace vía $regex en el repository.
		// No usamos text index porque el cluster está con apiStrict: true.
		{key: {location: "2dsphere"}, name: "location_2dsphere"},
		{key: {orgId: 1, deletedAt: 1}, name: "orgId_deletedAt"},
	]);

	logger.info("✅  Location indexes created");
}
