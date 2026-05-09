import {ObjectId} from "mongodb";

import {randomUUID} from "node:crypto";

import {logger} from "../../../config/logger";
import {extractTrailerDocument} from "../../../infrastructure/http/anthropicClient";
import {
	copyFile,
	deleteFile,
	extractKeyFromUrl,
	generateS3Key,
	getPresignedUrl,
	uploadFile,
	validateFile,
} from "../../../infrastructure/storage/s3.service";
import {
	NotFoundError,
	ValidationError,
} from "../../../shared/errors/AppError";
import {emitAuditEvent} from "../../audit/audit.service";
import type {AuditContext} from "../../audit/audit.types";

import {
	TRAILER_DOCUMENT_TYPE_CONFIG,
	type TrailerDocumentType,
} from "../constants/trailerDocumentTypes.constants";
import {findTrailerById} from "../trailers.repository";

import {
	countDocumentsByTrailer,
	findDocumentById,
	findDocumentsByTrailer,
	insertTrailerDocument,
	replaceDocumentFile,
	softDeleteDocument,
	updateDocumentFields,
} from "./trailer-documents.repository";
import type {
	CreateDocumentFromDraftDto,
	ExtractAndStashResult,
	ExtractionResult,
	TrailerDocument,
	TrailerDocumentEmbedded,
	UpdateTrailerDocumentDto,
	UploadTrailerDocumentDto,
} from "./trailer-documents.types";

// Prefijo S3 para archivos en zona "draft" (subidos en /extract antes de
// que el trailer exista). El cron de cleanup borra los > 24 h.
const DRAFT_PREFIX = "trailers-pending";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listTrailerDocuments(
	orgId: string,
	trailerId: string,
): Promise<TrailerDocument[]> {
	const trailer = await findTrailerById(orgId, trailerId);
	if (!trailer) throw new NotFoundError("Trailer");

	return findDocumentsByTrailer(orgId, trailerId);
}

export async function getTrailerDocument(
	orgId: string,
	id: string,
): Promise<TrailerDocument> {
	const doc = await findDocumentById(orgId, id);
	if (!doc) throw new NotFoundError("TrailerDocument");
	return doc;
}

export async function getTrailerDocumentSignedUrl(
	orgId: string,
	id: string,
): Promise<{url: string; expiresAt: Date}> {
	const doc = await getTrailerDocument(orgId, id);
	const key = extractKeyFromUrl(doc.fileUrl);
	return getPresignedUrl(key, 3600);
}

// ── Extract + stash (preview en wizard) ───────────────────────────────────
// El archivo se sube a S3 a `trailers-pending/{orgId}/...` para evitar
// que el cliente lo re-suba al crear el trailer. El cron lo limpia si
// el wizard se abandona.

export async function extractAndStashDocument(
	orgId: string,
	file: Express.Multer.File,
): Promise<ExtractAndStashResult> {
	validateFile(file.mimetype, file.size);

	const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
	const draftKey = `${DRAFT_PREFIX}/${orgId}/${Date.now()}_${randomUUID()}_${sanitizedName}`;

	// Subir a S3 y extraer en paralelo — son independientes.
	const [uploadRes, extraction] = await Promise.all([
		uploadFile(draftKey, file.buffer, file.mimetype),
		runExtraction(file),
	]);

	logger.info(
		{orgId, draftKey, type: extraction.type, confidence: extraction.confidence},
		"Trailer document drafted",
	);

	return {
		extraction,
		draft: {
			key: uploadRes.key,
			fileName: file.originalname,
			fileSize: uploadRes.fileSize,
			mimeType: uploadRes.mimeType,
		},
	};
}

async function runExtraction(file: Express.Multer.File): Promise<ExtractionResult> {
	try {
		return await extractTrailerDocument(file.buffer, file.mimetype);
	} catch (err) {
		logger.warn({err}, "Anthropic extraction failed — returning fallback");
		return {
			type: null,
			confidence: "low",
			fields: {},
			summary: "No se pudo identificar el documento. Captúralo manualmente.",
		};
	}
}

/** Borra un draft de S3 (ej. cuando el usuario lo descarta en el wizard). */
export async function discardDocumentDraft(
	orgId: string,
	draftKey: string,
): Promise<void> {
	if (!isValidDraftKey(orgId, draftKey)) {
		throw new ValidationError("draftKey inválido");
	}
	await deleteFile(draftKey);
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadTrailerDocument(
	orgId: string,
	trailerId: string,
	actorId: string,
	file: Express.Multer.File,
	dto: UploadTrailerDocumentDto,
	context: AuditContext,
): Promise<TrailerDocument> {
	const trailer = await findTrailerById(orgId, trailerId);
	if (!trailer) throw new NotFoundError("Trailer");

	validateFile(file.mimetype, file.size);

	if (!isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const config = TRAILER_DOCUMENT_TYPE_CONFIG[dto.type];

	const key = generateS3Key(
		"trailers",
		orgId,
		trailerId,
		"documents",
		file.originalname,
	);
	const upload = await uploadFile(key, file.buffer, file.mimetype);

	const now = new Date();
	const issuedAt = parseDate(dto.issuedAt);
	const expiresAt = parseDate(dto.expiresAt);
	const alertDays = dto.alertDays ?? config.defaultAlertDays;

	const docToInsert: Omit<TrailerDocumentEmbedded, "_id"> = {
		type: dto.type,
		name: dto.name?.trim() || file.originalname,
		fileUrl: upload.url,
		fileSize: upload.fileSize,
		mimeType: upload.mimeType,
		issuedAt,
		expiresAt,
		alertDays,
		status: "pending",
		notes: dto.notes?.trim() || null,
		extractedData: dto.extractedData ?? null,
		extractionConfidence: dto.extractionConfidence ?? null,
		previousVersions: [],
		verifiedAt: null,
		verifiedBy: null,
		uploadedAt: now,
		uploadedBy: new ObjectId(actorId),
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertTrailerDocument(orgId, trailerId, docToInsert);
	if (!created) throw new NotFoundError("Trailer");

	logger.info(
		{orgId, trailerId, docId: created.id, type: dto.type, key},
		"Trailer document uploaded",
	);

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_document_uploaded",
		target: {type: "trailer", id: trailerId, displayName: trailer.vin},
		metadata: {
			docId: created.id,
			docType: dto.type,
			fileSize: upload.fileSize,
			mimeType: upload.mimeType,
		},
		context,
	});

	return created;
}

// ── Create from draft (asocia archivo previamente subido en /extract) ────

export async function createDocumentFromDraft(
	orgId: string,
	trailerId: string,
	actorId: string,
	dto: CreateDocumentFromDraftDto,
	context: AuditContext,
): Promise<TrailerDocument> {
	const trailer = await findTrailerById(orgId, trailerId);
	if (!trailer) throw new NotFoundError("Trailer");

	if (!isValidDraftKey(orgId, dto.draftKey)) {
		throw new ValidationError("draftKey inválido o no pertenece a esta organización");
	}
	if (!isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const config = TRAILER_DOCUMENT_TYPE_CONFIG[dto.type];

	// Mover el archivo de pending → ubicación final del trailer (server-side copy)
	const destKey = generateS3Key(
		"trailers",
		orgId,
		trailerId,
		"documents",
		dto.fileName,
	);
	const copied = await copyFile(dto.draftKey, destKey);

	// Borrar el draft (best effort — si falla, el cron lo limpia)
	void deleteFile(dto.draftKey);

	const now = new Date();
	const issuedAt = parseDate(dto.issuedAt);
	const expiresAt = parseDate(dto.expiresAt);
	const alertDays = dto.alertDays ?? config.defaultAlertDays;

	const docToInsert: Omit<TrailerDocumentEmbedded, "_id"> = {
		type: dto.type,
		name: dto.name?.trim() || dto.fileName,
		fileUrl: copied.url,
		fileSize: copied.fileSize,
		mimeType: copied.mimeType,
		issuedAt,
		expiresAt,
		alertDays,
		status: "pending",
		notes: dto.notes?.trim() || null,
		extractedData: dto.extractedData ?? null,
		extractionConfidence: dto.extractionConfidence ?? null,
		previousVersions: [],
		verifiedAt: null,
		verifiedBy: null,
		uploadedAt: now,
		uploadedBy: new ObjectId(actorId),
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertTrailerDocument(orgId, trailerId, docToInsert);
	if (!created) throw new NotFoundError("Trailer");

	logger.info(
		{orgId, trailerId, docId: created.id, type: dto.type, destKey},
		"Trailer document created from draft",
	);

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_document_uploaded",
		target: {type: "trailer", id: trailerId, displayName: trailer.vin},
		metadata: {
			docId: created.id,
			docType: dto.type,
			fileSize: copied.fileSize,
			mimeType: copied.mimeType,
			fromDraft: true,
		},
		context,
	});

	return created;
}

// ── Update metadata ────────────────────────────────────────────────────────

export async function updateTrailerDocument(
	orgId: string,
	id: string,
	actorId: string,
	dto: UpdateTrailerDocumentDto,
	context: AuditContext,
): Promise<TrailerDocument> {
	const existing = await getTrailerDocument(orgId, id);

	if (dto.type && !isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const fields: Partial<TrailerDocumentEmbedded> = {};
	if (dto.type !== undefined) fields.type = dto.type;
	if (dto.name !== undefined) fields.name = dto.name?.trim() || existing.name;
	if (dto.issuedAt !== undefined) fields.issuedAt = parseDate(dto.issuedAt);
	if (dto.expiresAt !== undefined) fields.expiresAt = parseDate(dto.expiresAt);
	if (dto.alertDays !== undefined && dto.alertDays !== null) {
		fields.alertDays = dto.alertDays;
	}
	if (dto.notes !== undefined) fields.notes = dto.notes?.trim() || null;
	if (dto.status !== undefined) {
		fields.status = dto.status;
		if (dto.status === "verified") {
			fields.verifiedAt = new Date();
			fields.verifiedBy = new ObjectId(actorId);
		}
	}

	const updated = await updateDocumentFields(orgId, id, fields);
	if (!updated) throw new NotFoundError("TrailerDocument");

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_document_updated",
		target: {type: "trailer", id: existing.trailerId, displayName: existing.name},
		metadata: {docId: id, fieldsChanged: Object.keys(fields)},
		context,
	});

	return updated;
}

// ── Replace (renovación) ───────────────────────────────────────────────────

export async function replaceTrailerDocument(
	orgId: string,
	id: string,
	actorId: string,
	file: Express.Multer.File,
	context: AuditContext,
): Promise<TrailerDocument> {
	const existing = await getTrailerDocument(orgId, id);
	validateFile(file.mimetype, file.size);

	const key = generateS3Key(
		"trailers",
		orgId,
		existing.trailerId,
		"documents",
		file.originalname,
	);
	const upload = await uploadFile(key, file.buffer, file.mimetype);

	const updated = await replaceDocumentFile(
		orgId,
		id,
		{fileUrl: upload.url, fileSize: upload.fileSize, mimeType: upload.mimeType},
		actorId,
		{
			fileUrl: existing.fileUrl,
			fileSize: existing.fileSize,
			mimeType: existing.mimeType,
			uploadedAt: existing.uploadedAt,
			uploadedBy: new ObjectId(existing.uploadedBy),
		},
	);

	if (!updated) throw new NotFoundError("TrailerDocument");

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_document_replaced",
		target: {type: "trailer", id: existing.trailerId, displayName: existing.name},
		metadata: {docId: id, previousFileUrl: existing.fileUrl},
		context,
	});

	return updated;
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteTrailerDocument(
	orgId: string,
	id: string,
	context: AuditContext,
): Promise<void> {
	const existing = await getTrailerDocument(orgId, id);
	const ok = await softDeleteDocument(orgId, id);
	if (!ok) throw new NotFoundError("TrailerDocument");

	// Best-effort: borrar de S3 (no bloqueante)
	void deleteFile(extractKeyFromUrl(existing.fileUrl));

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_document_deleted",
		target: {type: "trailer", id: existing.trailerId, displayName: existing.name},
		metadata: {docId: id, type: existing.type},
		context,
	});
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidType(type: string | undefined): type is TrailerDocumentType {
	if (!type) return false;
	return Object.prototype.hasOwnProperty.call(TRAILER_DOCUMENT_TYPE_CONFIG, type);
}

/** Valida que un draftKey pertenezca al prefijo de la org. Defensa contra
 * inyección de URLs arbitrarias del bucket. */
function isValidDraftKey(orgId: string, key: string | undefined): boolean {
	if (!key || typeof key !== "string") return false;
	const expected = `${DRAFT_PREFIX}/${orgId}/`;
	return key.startsWith(expected);
}

function parseDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

// Re-export para el job de alertas
export {countDocumentsByTrailer};
