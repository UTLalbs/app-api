import {ObjectId} from "mongodb";

import {randomUUID} from "node:crypto";

import {logger} from "../../../config/logger";
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
	UNIT_DOCUMENT_TYPE_CONFIG,
	type UnitDocumentType,
} from "../constants/unitDocumentTypes.constants";
import {findUnitById} from "../units.repository";

import {extractUnitDocument} from "./unit-extraction.config";
import {
	countDocumentsByUnit,
	findDocumentById,
	findDocumentsByUnit,
	insertUnitDocument,
	replaceDocumentFile,
	softDeleteDocument,
	updateDocumentFields,
} from "./unit-documents.repository";
import type {
	CreateUnitDocumentFromDraftDto,
	ExtractAndStashUnitDocumentResult,
	UnitDocument,
	UnitDocumentEmbedded,
	UnitExtractionResult,
	UpdateUnitDocumentDto,
	UploadUnitDocumentDto,
} from "./unit-documents.types";

// Prefijo S3 para archivos en zona "draft" (subidos en /extract antes de
// que la unidad exista). El cron de cleanup borra los > 24 h.
const DRAFT_PREFIX = "units-pending";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listUnitDocuments(
	orgId: string,
	unitId: string,
): Promise<UnitDocument[]> {
	const unit = await findUnitById(orgId, unitId);
	if (!unit) throw new NotFoundError("Unit");

	return findDocumentsByUnit(orgId, unitId);
}

export async function getUnitDocument(
	orgId: string,
	id: string,
): Promise<UnitDocument> {
	const doc = await findDocumentById(orgId, id);
	if (!doc) throw new NotFoundError("UnitDocument");
	return doc;
}

export async function getUnitDocumentSignedUrl(
	orgId: string,
	id: string,
): Promise<{url: string; expiresAt: Date}> {
	const doc = await getUnitDocument(orgId, id);
	const key = extractKeyFromUrl(doc.fileUrl);
	return getPresignedUrl(key, 3600);
}

// ── Extract + stash (preview en wizard) ───────────────────────────────────

export async function extractAndStashDocument(
	orgId: string,
	file: Express.Multer.File,
): Promise<ExtractAndStashUnitDocumentResult> {
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
		"Unit document drafted",
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

async function runExtraction(file: Express.Multer.File): Promise<UnitExtractionResult> {
	try {
		return await extractUnitDocument(file.buffer, file.mimetype);
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

export async function uploadUnitDocument(
	orgId: string,
	unitId: string,
	actorId: string,
	file: Express.Multer.File,
	dto: UploadUnitDocumentDto,
	context: AuditContext,
): Promise<UnitDocument> {
	const unit = await findUnitById(orgId, unitId);
	if (!unit) throw new NotFoundError("Unit");

	validateFile(file.mimetype, file.size);

	if (!isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const config = UNIT_DOCUMENT_TYPE_CONFIG[dto.type];

	const key = generateS3Key(
		"units",
		orgId,
		unitId,
		"documents",
		file.originalname,
	);
	const upload = await uploadFile(key, file.buffer, file.mimetype);

	const now = new Date();
	const issuedAt = parseDate(dto.issuedAt);
	const expiresAt = parseDate(dto.expiresAt);
	const alertDays = dto.alertDays ?? config.defaultAlertDays;

	const docToInsert: Omit<UnitDocumentEmbedded, "_id"> = {
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

	const created = await insertUnitDocument(orgId, unitId, docToInsert);
	if (!created) throw new NotFoundError("Unit");

	logger.info(
		{orgId, unitId, docId: created.id, type: dto.type, key},
		"Unit document uploaded",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_document_uploaded",
		target: {type: "unit", id: unitId, displayName: unit.vin},
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

// ── Create from draft ─────────────────────────────────────────────────────

export async function createDocumentFromDraft(
	orgId: string,
	unitId: string,
	actorId: string,
	dto: CreateUnitDocumentFromDraftDto,
	context: AuditContext,
): Promise<UnitDocument> {
	const unit = await findUnitById(orgId, unitId);
	if (!unit) throw new NotFoundError("Unit");

	if (!isValidDraftKey(orgId, dto.draftKey)) {
		throw new ValidationError("draftKey inválido o no pertenece a esta organización");
	}
	if (!isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const config = UNIT_DOCUMENT_TYPE_CONFIG[dto.type];

	const destKey = generateS3Key(
		"units",
		orgId,
		unitId,
		"documents",
		dto.fileName,
	);
	const copied = await copyFile(dto.draftKey, destKey);

	// Borrar el draft (best effort)
	void deleteFile(dto.draftKey);

	const now = new Date();
	const issuedAt = parseDate(dto.issuedAt);
	const expiresAt = parseDate(dto.expiresAt);
	const alertDays = dto.alertDays ?? config.defaultAlertDays;

	const docToInsert: Omit<UnitDocumentEmbedded, "_id"> = {
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

	const created = await insertUnitDocument(orgId, unitId, docToInsert);
	if (!created) throw new NotFoundError("Unit");

	logger.info(
		{orgId, unitId, docId: created.id, type: dto.type, destKey},
		"Unit document created from draft",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_document_uploaded",
		target: {type: "unit", id: unitId, displayName: unit.vin},
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

export async function updateUnitDocument(
	orgId: string,
	id: string,
	actorId: string,
	dto: UpdateUnitDocumentDto,
	context: AuditContext,
): Promise<UnitDocument> {
	const existing = await getUnitDocument(orgId, id);

	if (dto.type && !isValidType(dto.type)) {
		throw new ValidationError(`Tipo de documento inválido: ${dto.type}`);
	}

	const fields: Partial<UnitDocumentEmbedded> = {};
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
	if (!updated) throw new NotFoundError("UnitDocument");

	await emitAuditEvent({
		category: "units",
		action: "unit_document_updated",
		target: {type: "unit", id: existing.unitId, displayName: existing.name},
		metadata: {docId: id, fieldsChanged: Object.keys(fields)},
		context,
	});

	return updated;
}

// ── Replace (renovación) ───────────────────────────────────────────────────

export async function replaceUnitDocument(
	orgId: string,
	id: string,
	actorId: string,
	file: Express.Multer.File,
	context: AuditContext,
): Promise<UnitDocument> {
	const existing = await getUnitDocument(orgId, id);
	validateFile(file.mimetype, file.size);

	const key = generateS3Key(
		"units",
		orgId,
		existing.unitId,
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

	if (!updated) throw new NotFoundError("UnitDocument");

	await emitAuditEvent({
		category: "units",
		action: "unit_document_replaced",
		target: {type: "unit", id: existing.unitId, displayName: existing.name},
		metadata: {docId: id, previousFileUrl: existing.fileUrl},
		context,
	});

	return updated;
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteUnitDocument(
	orgId: string,
	id: string,
	context: AuditContext,
): Promise<void> {
	const existing = await getUnitDocument(orgId, id);
	const ok = await softDeleteDocument(orgId, id);
	if (!ok) throw new NotFoundError("UnitDocument");

	void deleteFile(extractKeyFromUrl(existing.fileUrl));

	await emitAuditEvent({
		category: "units",
		action: "unit_document_deleted",
		target: {type: "unit", id: existing.unitId, displayName: existing.name},
		metadata: {docId: id, type: existing.type},
		context,
	});
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidType(type: string | undefined): type is UnitDocumentType {
	if (!type) return false;
	return Object.prototype.hasOwnProperty.call(UNIT_DOCUMENT_TYPE_CONFIG, type);
}

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

// Re-export para el job de alertas (Fase 5)
export {countDocumentsByUnit};
