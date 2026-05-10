import type {ObjectId} from "mongodb";

import type {ExtractionConfidence} from "../../../infrastructure/http/document-extraction.types";
import type {UnitDocumentType} from "../constants/unitDocumentTypes.constants";

export type {ExtractionConfidence};

export type UnitDocumentStatus = "pending" | "verified" | "expired" | "rejected";

// ── Versión histórica ────────────────────────────────────────────────────

export interface UnitDocumentVersion {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: ObjectId;
}

// ── Subdocumento embebido en Unit ─────────────────────────────────────────

export interface UnitDocumentEmbedded {
	_id: ObjectId;

	type: UnitDocumentType;
	name: string;
	fileUrl: string;
	fileSize: number;
	mimeType: string;

	issuedAt: Date | null;
	expiresAt: Date | null;
	alertDays: number;

	status: UnitDocumentStatus;
	notes: string | null;

	extractedData: Record<string, unknown> | null;
	extractionConfidence: ExtractionConfidence | null;

	previousVersions: UnitDocumentVersion[];

	verifiedAt: Date | null;
	verifiedBy: ObjectId | null;

	uploadedAt: Date;
	uploadedBy: ObjectId;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio ───────────────────────────────────────────────────────

export interface UnitDocumentVersionView {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: string;
}

export interface UnitDocument
	extends Omit<UnitDocumentEmbedded, "_id" | "uploadedBy" | "verifiedBy" | "previousVersions"> {
	id: string;
	orgId: string;
	unitId: string;
	uploadedBy: string;
	verifiedBy: string | null;
	previousVersions: UnitDocumentVersionView[];
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface UploadUnitDocumentDto {
	type: UnitDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	extractedData?: Record<string, unknown> | null;
	extractionConfidence?: ExtractionConfidence | null;
}

export interface UpdateUnitDocumentDto {
	type?: UnitDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	status?: UnitDocumentStatus;
}

// ── Resultado de extracción Claude ────────────────────────────────────────

export interface ExtractedUnitFields {
	vin?: string | null;
	plates_mx?: string | null;
	plates_us?: string | null;
	us_state?: string | null;
	make?: string | null;
	model?: string | null;
	modelYear?: number | null;
	manufacturer?: string | null;
	color?: string | null;
	engineNumber?: string | null;
	satConfigCode?: string | null;
	sctPermitType?: string | null;
	sctPermitNumber?: string | null;
	fuelTypeCodeSAT?: string | null;
	issuedAt?: string | null;
	expiresAt?: string | null;
	ownerName?: string | null;
	ownerRfc?: string | null;
}

export interface UnitExtractionResult {
	type: UnitDocumentType | null;
	confidence: ExtractionConfidence;
	fields: ExtractedUnitFields;
	summary: string;
}

// ── Draft del archivo ya subido a S3 ──────────────────────────────────────

export interface UnitDocumentDraft {
	key: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
}

export interface ExtractAndStashUnitDocumentResult {
	extraction: UnitExtractionResult;
	draft: UnitDocumentDraft;
}

export interface CreateUnitDocumentFromDraftDto {
	draftKey: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	type: UnitDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	extractedData?: Record<string, unknown> | null;
	extractionConfidence?: ExtractionConfidence | null;
}
