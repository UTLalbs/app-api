import type {ObjectId} from "mongodb";

import type {TrailerDocumentType} from "../constants/trailerDocumentTypes.constants";

export type TrailerDocumentStatus = "pending" | "verified" | "expired" | "rejected";

export type ExtractionConfidence = "high" | "medium" | "low";

// ── Subdocumentos ────────────────────────────────────────────────────────

export interface TrailerDocumentVersion {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: ObjectId;
}

// ── Subdocumento embebido en el Trailer ─────────────────────────────────
// El doc vive dentro de `trailers.documents[]`. orgId/trailerId NO se duplican
// porque son redundantes con el documento padre (el trailer ya tiene ambos).

export interface TrailerDocumentEmbedded {
	_id: ObjectId;

	type: TrailerDocumentType;
	name: string; // nombre original del archivo
	fileUrl: string;
	fileSize: number;
	mimeType: string;

	issuedAt: Date | null;
	expiresAt: Date | null;
	alertDays: number; // días antes del vencimiento

	status: TrailerDocumentStatus;
	notes: string | null;

	/** Datos crudos de la extracción Claude (puede usarse para auditoría/debug). */
	extractedData: Record<string, unknown> | null;
	extractionConfidence: ExtractionConfidence | null;

	/** Versiones reemplazadas por renovación (la actual NO está aquí). */
	previousVersions: TrailerDocumentVersion[];

	verifiedAt: Date | null;
	verifiedBy: ObjectId | null;

	uploadedAt: Date;
	uploadedBy: ObjectId;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio (ObjectId → string) ──────────────────────────────────

export interface TrailerDocumentVersionView {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: string;
}

export interface TrailerDocument
	extends Omit<
		TrailerDocumentEmbedded,
		"_id" | "uploadedBy" | "verifiedBy" | "previousVersions"
	> {
	id: string;
	orgId: string;
	trailerId: string;
	uploadedBy: string;
	verifiedBy: string | null;
	previousVersions: TrailerDocumentVersionView[];
}

// ── DTOs ────────────────────────────────────────────────────────────────

export interface UploadTrailerDocumentDto {
	type: TrailerDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	/** Si viene del flujo del wizard con preview de extracción Claude. */
	extractedData?: Record<string, unknown> | null;
	extractionConfidence?: ExtractionConfidence | null;
}

export interface UpdateTrailerDocumentDto {
	type?: TrailerDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	status?: TrailerDocumentStatus;
}

// ── Resultado de extracción Claude (stateless) ───────────────────────────

export interface ExtractedFields {
	vin?: string | null;
	plates_mx?: string | null;
	plates_us?: string | null;
	us_state?: string | null;
	make?: string | null;
	model?: string | null;
	modelYear?: number | null;
	manufacturer?: string | null;
	ctrSubtype?: string | null;
	issuedAt?: string | null; // ISO date
	expiresAt?: string | null; // ISO date
	/** Nombre del propietario del remolque tal como aparece en el documento
	 * (ej. tarjeta de circulación o title). Útil para preseleccionar en el
	 * wizard. */
	ownerName?: string | null;
	/** RFC mexicano del propietario si aparece en el documento. */
	ownerRfc?: string | null;
}

export interface ExtractionResult {
	type: TrailerDocumentType | null;
	confidence: ExtractionConfidence;
	fields: ExtractedFields;
	summary: string;
}

// ── Draft del archivo ya subido a S3 (zona "pending") ────────────────────

export interface DocumentDraft {
	key: string;       // S3 key bajo prefijo trailers-pending/{orgId}/...
	fileName: string;  // nombre original
	fileSize: number;
	mimeType: string;
}

/** Response del endpoint POST /trailers/documents/extract. */
export interface ExtractAndStashResult {
	extraction: ExtractionResult;
	draft: DocumentDraft;
}

/** DTO para POST /trailers/:trailerId/documents/from-draft. */
export interface CreateDocumentFromDraftDto {
	draftKey: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	type: TrailerDocumentType;
	name?: string | null;
	issuedAt?: string | Date | null;
	expiresAt?: string | Date | null;
	alertDays?: number | null;
	notes?: string | null;
	extractedData?: Record<string, unknown> | null;
	extractionConfidence?: ExtractionConfidence | null;
}
