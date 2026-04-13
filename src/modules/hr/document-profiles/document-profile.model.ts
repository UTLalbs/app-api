import type {Collection} from "mongodb";

import {getDb} from "../../../config/database";
import {logger} from "../../../config/logger";

import type {DocumentProfileDocument} from "./document-profile.types";

export function getDocumentProfileCollection(): Collection<DocumentProfileDocument> {
	return getDb().collection<DocumentProfileDocument>("document_profiles");
}

export async function createDocumentProfileIndexes(): Promise<void> {
	const collection = getDocumentProfileCollection();

	await collection.createIndexes([
		{key: {orgId: 1}, name: "orgId"},
		{key: {orgId: 1, name: 1}, name: "orgId_name", unique: true},
	]);

	logger.info("✅  Document profile indexes created");
}
