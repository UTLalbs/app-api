import {ObjectId} from "mongodb";

import {getUnitCollection} from "../units.model";
import type {UnitDocument as UnitEntityDoc} from "../units.types";

import type {
	UnitDocument,
	UnitDocumentEmbedded,
	UnitDocumentVersion,
	UnitDocumentVersionView,
} from "./unit-documents.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toVersion(v: UnitDocumentVersion): UnitDocumentVersionView {
	return {
		fileUrl: v.fileUrl,
		fileSize: v.fileSize,
		mimeType: v.mimeType,
		uploadedAt: v.uploadedAt,
		uploadedBy: v.uploadedBy.toHexString(),
	};
}

function toUnitDocument(
	embedded: UnitDocumentEmbedded,
	orgId: ObjectId,
	unitId: ObjectId,
): UnitDocument {
	const {_id, uploadedBy, verifiedBy, previousVersions, ...rest} = embedded;
	return {
		...rest,
		id: _id.toHexString(),
		orgId: orgId.toHexString(),
		unitId: unitId.toHexString(),
		uploadedBy: uploadedBy.toHexString(),
		verifiedBy: verifiedBy ? verifiedBy.toHexString() : null,
		previousVersions: (previousVersions ?? []).map(toVersion),
	};
}

// ── Lecturas ──────────────────────────────────────────────────────────────

export async function findDocumentsByUnit(
	orgId: string,
	unitId: string,
): Promise<UnitDocument[]> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(unitId)) return [];

	const unit = await getUnitCollection().findOne(
		{
			_id: new ObjectId(unitId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{projection: {documents: 1, orgId: 1}},
	);
	if (!unit) return [];

	const docs = (unit.documents ?? []).filter((d) => d.deletedAt === null);
	docs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

	return docs.map((d) => toUnitDocument(d, unit.orgId, unit._id));
}

export async function findDocumentById(
	orgId: string,
	id: string,
): Promise<UnitDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const docId = new ObjectId(id);
	const unit = await getUnitCollection().findOne(
		{
			orgId: new ObjectId(orgId),
			"documents._id": docId,
			deletedAt: null,
		},
		{projection: {documents: 1, orgId: 1}},
	);
	if (!unit) return null;

	const embedded = (unit.documents ?? []).find((d) => d._id.equals(docId));
	if (!embedded || embedded.deletedAt !== null) return null;

	return toUnitDocument(embedded, unit.orgId, unit._id);
}

/** Para el job de alertas: docs no eliminados con expiresAt. Iteración por org. */
export async function findDocumentsWithExpiry(
	orgId?: string,
): Promise<Array<{document: UnitDocument; unit: UnitEntityDoc}>> {
	const query: Record<string, unknown> = {
		"documents.expiresAt": {$ne: null},
		deletedAt: null,
	};
	if (orgId && ObjectId.isValid(orgId)) {
		query.orgId = new ObjectId(orgId);
	}

	const units = await getUnitCollection().find(query).toArray();
	const out: Array<{document: UnitDocument; unit: UnitEntityDoc}> = [];

	for (const unit of units) {
		for (const embedded of unit.documents ?? []) {
			if (embedded.deletedAt !== null) continue;
			if (!embedded.expiresAt) continue;
			out.push({
				document: toUnitDocument(embedded, unit.orgId, unit._id),
				unit: unit as UnitEntityDoc,
			});
		}
	}

	return out;
}

// ── Inserción ─────────────────────────────────────────────────────────────

export async function insertUnitDocument(
	orgId: string,
	unitId: string,
	embedded: Omit<UnitDocumentEmbedded, "_id">,
): Promise<UnitDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(unitId)) return null;

	const _id = new ObjectId();
	const fullEmbedded: UnitDocumentEmbedded = {_id, ...embedded};

	const result = await getUnitCollection().findOneAndUpdate(
		{
			_id: new ObjectId(unitId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{$push: {documents: fullEmbedded}, $set: {updatedAt: new Date()}},
		{returnDocument: "after", projection: {documents: 1, orgId: 1}},
	);

	if (!result) return null;
	return toUnitDocument(fullEmbedded, result.orgId, result._id);
}

// ── Updates ───────────────────────────────────────────────────────────────

export async function updateDocumentFields(
	orgId: string,
	id: string,
	fields: Partial<UnitDocumentEmbedded>,
): Promise<UnitDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const docId = new ObjectId(id);
	const setOps: Record<string, unknown> = {
		"documents.$[d].updatedAt": new Date(),
		updatedAt: new Date(),
	};
	for (const [k, v] of Object.entries(fields)) {
		setOps[`documents.$[d].${k}`] = v;
	}

	const result = await getUnitCollection().findOneAndUpdate(
		{
			orgId: new ObjectId(orgId),
			"documents._id": docId,
			deletedAt: null,
		},
		{$set: setOps},
		{
			returnDocument: "after",
			arrayFilters: [{"d._id": docId}],
			projection: {documents: 1, orgId: 1},
		},
	);

	if (!result) return null;
	const embedded = (result.documents ?? []).find((d) => d._id.equals(docId));
	if (!embedded) return null;
	return toUnitDocument(embedded, result.orgId, result._id);
}

export async function replaceDocumentFile(
	orgId: string,
	id: string,
	newFile: {fileUrl: string; fileSize: number; mimeType: string},
	uploadedBy: string,
	previousVersion: UnitDocumentVersion,
): Promise<UnitDocument | null> {
	if (
		!ObjectId.isValid(orgId)
		|| !ObjectId.isValid(id)
		|| !ObjectId.isValid(uploadedBy)
	) {
		return null;
	}

	const docId = new ObjectId(id);
	const now = new Date();

	const result = await getUnitCollection().findOneAndUpdate(
		{
			orgId: new ObjectId(orgId),
			"documents._id": docId,
			deletedAt: null,
		},
		{
			$set: {
				"documents.$[d].fileUrl": newFile.fileUrl,
				"documents.$[d].fileSize": newFile.fileSize,
				"documents.$[d].mimeType": newFile.mimeType,
				"documents.$[d].uploadedBy": new ObjectId(uploadedBy),
				"documents.$[d].uploadedAt": now,
				"documents.$[d].updatedAt": now,
				updatedAt: now,
			},
			$push: {"documents.$[d].previousVersions": previousVersion},
		},
		{
			returnDocument: "after",
			arrayFilters: [{"d._id": docId}],
			projection: {documents: 1, orgId: 1},
		},
	);

	if (!result) return null;
	const embedded = (result.documents ?? []).find((d) => d._id.equals(docId));
	if (!embedded) return null;
	return toUnitDocument(embedded, result.orgId, result._id);
}

// ── Soft delete ──────────────────────────────────────────────────────────

export async function softDeleteDocument(
	orgId: string,
	id: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return false;

	const docId = new ObjectId(id);
	const now = new Date();

	const result = await getUnitCollection().updateOne(
		{
			orgId: new ObjectId(orgId),
			"documents._id": docId,
			deletedAt: null,
		},
		{
			$set: {
				"documents.$[d].deletedAt": now,
				"documents.$[d].updatedAt": now,
				updatedAt: now,
			},
		},
		{arrayFilters: [{"d._id": docId}]},
	);

	return result.matchedCount > 0;
}

export async function countDocumentsByUnit(
	orgId: string,
	unitId: string,
): Promise<number> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(unitId)) return 0;

	const unit = await getUnitCollection().findOne(
		{
			_id: new ObjectId(unitId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{projection: {documents: 1}},
	);
	if (!unit) return 0;

	return (unit.documents ?? []).filter((d) => d.deletedAt === null).length;
}
