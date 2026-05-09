import {ObjectId} from "mongodb";

import {getTrailerCollection} from "../trailers.model";
import type {TrailerDocument as TrailerEntityDoc} from "../trailers.types";

import type {
	TrailerDocument,
	TrailerDocumentEmbedded,
	TrailerDocumentVersion,
	TrailerDocumentVersionView,
} from "./trailer-documents.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toVersion(v: TrailerDocumentVersion): TrailerDocumentVersionView {
	return {
		fileUrl: v.fileUrl,
		fileSize: v.fileSize,
		mimeType: v.mimeType,
		uploadedAt: v.uploadedAt,
		uploadedBy: v.uploadedBy.toHexString(),
	};
}

/** Hidrata un subdocumento embebido al shape de dominio (con orgId/trailerId). */
function toTrailerDocument(
	embedded: TrailerDocumentEmbedded,
	orgId: ObjectId,
	trailerId: ObjectId,
): TrailerDocument {
	const {_id, uploadedBy, verifiedBy, previousVersions, ...rest} = embedded;
	return {
		...rest,
		id: _id.toHexString(),
		orgId: orgId.toHexString(),
		trailerId: trailerId.toHexString(),
		uploadedBy: uploadedBy.toHexString(),
		verifiedBy: verifiedBy ? verifiedBy.toHexString() : null,
		previousVersions: (previousVersions ?? []).map(toVersion),
	};
}

// ── Lecturas ──────────────────────────────────────────────────────────────

export async function findDocumentsByTrailer(
	orgId: string,
	trailerId: string,
): Promise<TrailerDocument[]> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(trailerId)) return [];

	const trailer = await getTrailerCollection().findOne(
		{
			_id: new ObjectId(trailerId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{projection: {documents: 1, orgId: 1}},
	);
	if (!trailer) return [];

	const docs = (trailer.documents ?? []).filter((d) => d.deletedAt === null);
	// Ordenar por uploadedAt descendente
	docs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

	return docs.map((d) => toTrailerDocument(d, trailer.orgId, trailer._id));
}

export async function findDocumentById(
	orgId: string,
	id: string,
): Promise<TrailerDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const docId = new ObjectId(id);
	const trailer = await getTrailerCollection().findOne(
		{
			orgId: new ObjectId(orgId),
			"documents._id": docId,
			deletedAt: null,
		},
		{projection: {documents: 1, orgId: 1}},
	);
	if (!trailer) return null;

	const embedded = (trailer.documents ?? []).find((d) => d._id.equals(docId));
	if (!embedded || embedded.deletedAt !== null) return null;

	return toTrailerDocument(embedded, trailer.orgId, trailer._id);
}

/**
 * Para el job de alertas: devuelve todos los documentos no eliminados con
 * expiresAt no nulo, junto con su trailer padre (para tener acceso a vin/
 * economicNumber en el mensaje de la task). Iteración por org.
 */
export async function findDocumentsWithExpiry(
	orgId?: string,
): Promise<Array<{document: TrailerDocument; trailer: TrailerEntityDoc}>> {
	const query: Record<string, unknown> = {
		"documents.expiresAt": {$ne: null},
		deletedAt: null,
	};
	if (orgId && ObjectId.isValid(orgId)) {
		query.orgId = new ObjectId(orgId);
	}

	const trailers = await getTrailerCollection().find(query).toArray();
	const out: Array<{document: TrailerDocument; trailer: TrailerEntityDoc}> = [];

	for (const trailer of trailers) {
		for (const embedded of trailer.documents ?? []) {
			if (embedded.deletedAt !== null) continue;
			if (!embedded.expiresAt) continue;
			out.push({
				document: toTrailerDocument(embedded, trailer.orgId, trailer._id),
				trailer: trailer as TrailerEntityDoc,
			});
		}
	}

	return out;
}

// ── Inserción ─────────────────────────────────────────────────────────────

export async function insertTrailerDocument(
	orgId: string,
	trailerId: string,
	embedded: Omit<TrailerDocumentEmbedded, "_id">,
): Promise<TrailerDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(trailerId)) return null;

	const _id = new ObjectId();
	const fullEmbedded: TrailerDocumentEmbedded = {_id, ...embedded};

	const result = await getTrailerCollection().findOneAndUpdate(
		{
			_id: new ObjectId(trailerId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{$push: {documents: fullEmbedded}, $set: {updatedAt: new Date()}},
		{returnDocument: "after", projection: {documents: 1, orgId: 1}},
	);

	if (!result) return null;
	return toTrailerDocument(fullEmbedded, result.orgId, result._id);
}

// ── Updates ───────────────────────────────────────────────────────────────

/**
 * Actualiza campos de un subdocumento dentro del array `documents`. Usa
 * arrayFilters para apuntar al elemento exacto.
 */
export async function updateDocumentFields(
	orgId: string,
	id: string,
	fields: Partial<TrailerDocumentEmbedded>,
): Promise<TrailerDocument | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const docId = new ObjectId(id);
	const setOps: Record<string, unknown> = {
		"documents.$[d].updatedAt": new Date(),
		updatedAt: new Date(),
	};
	for (const [k, v] of Object.entries(fields)) {
		setOps[`documents.$[d].${k}`] = v;
	}

	const result = await getTrailerCollection().findOneAndUpdate(
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
	return toTrailerDocument(embedded, result.orgId, result._id);
}

/**
 * Reemplaza el archivo del documento y mete el actual como versión previa.
 */
export async function replaceDocumentFile(
	orgId: string,
	id: string,
	newFile: {fileUrl: string; fileSize: number; mimeType: string},
	uploadedBy: string,
	previousVersion: TrailerDocumentVersion,
): Promise<TrailerDocument | null> {
	if (
		!ObjectId.isValid(orgId)
		|| !ObjectId.isValid(id)
		|| !ObjectId.isValid(uploadedBy)
	) {
		return null;
	}

	const docId = new ObjectId(id);
	const now = new Date();

	const result = await getTrailerCollection().findOneAndUpdate(
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
	return toTrailerDocument(embedded, result.orgId, result._id);
}

// ── Soft delete ──────────────────────────────────────────────────────────

export async function softDeleteDocument(
	orgId: string,
	id: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return false;

	const docId = new ObjectId(id);
	const now = new Date();

	const result = await getTrailerCollection().updateOne(
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

/** Cuenta documentos no eliminados de un trailer. */
export async function countDocumentsByTrailer(
	orgId: string,
	trailerId: string,
): Promise<number> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(trailerId)) return 0;

	const trailer = await getTrailerCollection().findOne(
		{
			_id: new ObjectId(trailerId),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{projection: {documents: 1}},
	);
	if (!trailer) return 0;

	return (trailer.documents ?? []).filter((d) => d.deletedAt === null).length;
}
