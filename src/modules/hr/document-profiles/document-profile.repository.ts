import {ObjectId} from "mongodb";

import {getDocumentProfileCollection} from "./document-profile.model";
import type {
	CreateDocumentProfileDto,
	DocumentProfile,
	DocumentProfileDocument,
	UpdateDocumentProfileDto,
} from "./document-profile.types";

function toDocumentProfile(doc: DocumentProfileDocument): DocumentProfile {
	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId.toHexString(),
		name: doc.name,
		description: doc.description,
		documentTypes: doc.documentTypes,
		createdBy: doc.createdBy.toHexString(),
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

export async function findAllDocumentProfiles(
	orgId: string,
): Promise<DocumentProfile[]> {
	const docs = await getDocumentProfileCollection()
		.find({orgId: new ObjectId(orgId)})
		.sort({name: 1})
		.toArray();

	return docs.map((doc) => toDocumentProfile(doc as DocumentProfileDocument));
}

export async function findDocumentProfileById(
	id: string,
	orgId: string,
): Promise<DocumentProfile | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getDocumentProfileCollection().findOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
	});

	return doc ? toDocumentProfile(doc as DocumentProfileDocument) : null;
}

export async function findDocumentProfileByName(
	orgId: string,
	name: string,
): Promise<DocumentProfile | null> {
	const doc = await getDocumentProfileCollection().findOne({
		orgId: new ObjectId(orgId),
		name,
	});

	return doc ? toDocumentProfile(doc as DocumentProfileDocument) : null;
}

export async function createDocumentProfile(
	dto: CreateDocumentProfileDto,
): Promise<DocumentProfile> {
	const now = new Date();

	const doc: Omit<DocumentProfileDocument, "_id"> = {
		orgId: new ObjectId(dto.orgId),
		name: dto.name,
		description: dto.description,
		documentTypes: dto.documentTypes,
		createdBy: new ObjectId(dto.createdBy),
		createdAt: now,
		updatedAt: now,
	};

	const result = await getDocumentProfileCollection().insertOne(
		doc as DocumentProfileDocument,
	);

	return toDocumentProfile({
		_id: result.insertedId,
		...doc,
	} as DocumentProfileDocument);
}

export async function updateDocumentProfile(
	id: string,
	orgId: string,
	dto: UpdateDocumentProfileDto,
): Promise<DocumentProfile | null> {
	if (!ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	if (dto.name !== undefined) setFields.name = dto.name;
	if (dto.description !== undefined) setFields.description = dto.description;
	if (dto.documentTypes !== undefined) {
		// Normalizar — asegurar que todos sean { type, required }
		setFields.documentTypes = dto.documentTypes.map((entry) =>
			typeof entry === "string" ? {type: entry, required: true} : entry,
		);
	}

	const result = await getDocumentProfileCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{$set: setFields},
		{returnDocument: "after"},
	);

	return result ? toDocumentProfile(result as DocumentProfileDocument) : null;
}
export async function deleteDocumentProfile(
	id: string,
	orgId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;

	const result = await getDocumentProfileCollection().deleteOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
	});

	return result.deletedCount > 0;
}
