import type {Collection} from "mongodb";

import {getDb} from "../../config/database";
import {logger} from "../../config/logger";

import type {LocationTagDocument} from "./location.types";

export function getLocationTagCollection(): Collection<LocationTagDocument> {
	return getDb().collection<LocationTagDocument>("location_tags");
}

export async function createLocationTagIndexes(): Promise<void> {
	const collection = getLocationTagCollection();

	await collection.createIndexes([
		{key: {orgId: 1, tag: 1}, name: "orgId_tag_unique", unique: true},
		{key: {orgId: 1, isSystem: 1}, name: "orgId_isSystem"},
		{key: {orgId: 1, usageCount: -1}, name: "orgId_usageCount_desc"},
	]);

	logger.info("✅  Location tag indexes created");
}
