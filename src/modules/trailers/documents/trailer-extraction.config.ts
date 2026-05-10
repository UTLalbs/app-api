import {extractDocument} from "../../../infrastructure/http/anthropicClient";
import type {
	BaseExtractionResult,
	DocumentExtractionConfig,
} from "../../../infrastructure/http/document-extraction.types";

import {
	TRAILER_DOCUMENT_TYPE_CONFIG,
	TRAILER_DOCUMENT_TYPES,
	type TrailerDocumentType,
} from "../constants/trailerDocumentTypes.constants";

import type {ExtractedFields, ExtractionResult} from "./trailer-documents.types";

// ── System prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
	const lines: string[] = [
		"Eres un asistente experto en documentación de transporte de carga (México y Estados Unidos).",
		"",
		"Tu tarea: dado un documento (PDF o imagen) que pertenece a un remolque/trailer, identificar el tipo y extraer los campos clave.",
		"",
		"Tipos de documento posibles:",
	];

	for (const code of TRAILER_DOCUMENT_TYPES) {
		const cfg = TRAILER_DOCUMENT_TYPE_CONFIG[code];
		lines.push(`- ${code} (${cfg.country}): ${cfg.label}. Vence: ${cfg.hasExpiry ? "sí" : "no"}.`);
	}

	lines.push(
		"",
		"Reglas de extracción:",
		"- Devuelve solo los campos que el documento contiene de forma legible. No inventes datos.",
		"- VIN: 17 caracteres alfanuméricos sin I/O/Q. Si lo encuentras parcial o ilegible, déjalo null.",
		"- Placas mexicanas: 6-7 caracteres alfanuméricos en mayúsculas; van en plates_mx.",
		"- Placas US: 1-8 caracteres alfanuméricos; van en plates_us. El estado US (2 letras) en us_state.",
		"- Fechas: formato ISO yyyy-mm-dd. issuedAt = fecha de expedición/emisión. expiresAt = vencimiento (solo si aplica al tipo).",
		"- modelYear: año del modelo del remolque (entero entre 1980 y el año actual + 1).",
		"- ctrSubtype: si el documento menciona explícitamente un subtipo SAT (formato 'CTR' + 3 dígitos), inclúyelo. Si no, déjalo null.",
		"- ownerName: nombre del propietario/titular del remolque tal como aparece en el documento (ej. 'Erick Solis Mahl' en tarjeta de circulación, o 'WALMART DE MEXICO SA DE CV'). Si no aparece, null.",
		"- ownerRfc: RFC mexicano del propietario si está presente (12 chars persona moral, 13 chars persona física). Si no, null.",
		"- summary: una frase breve (≤120 caracteres) describiendo qué identificaste.",
		"",
		"Confianza:",
		"- 'high' = puedes identificar el tipo con seguridad y los campos principales (VIN o placas) son legibles.",
		"- 'medium' = identificas el tipo pero faltan o son dudosos algunos campos.",
		"- 'low' = no puedes identificar el tipo o el documento es ilegible.",
		"",
		"Si el documento NO corresponde a ningún tipo del catálogo, devuelve type=null con confidence=low y un summary explicando qué viste.",
	);

	return lines.join("\n");
}

// ── JSON schema del campo `fields` del tool ───────────────────────────────

const TRAILER_FIELDS_SCHEMA: Record<string, unknown> = {
	type: "object",
	description: "Campos extraídos del documento (solo los presentes y legibles).",
	properties: {
		vin: {type: ["string", "null"], description: "VIN de 17 caracteres."},
		plates_mx: {type: ["string", "null"], description: "Placa mexicana."},
		plates_us: {type: ["string", "null"], description: "Placa estadounidense."},
		us_state: {
			type: ["string", "null"],
			description: "Estado US de 2 letras (TX, CA, AZ, etc.).",
		},
		make: {type: ["string", "null"], description: "Marca del remolque."},
		model: {type: ["string", "null"], description: "Modelo."},
		modelYear: {
			type: ["integer", "null"],
			description: "Año del modelo (entero).",
		},
		manufacturer: {
			type: ["string", "null"],
			description: "Razón social del fabricante.",
		},
		ctrSubtype: {
			type: ["string", "null"],
			description: "Subtipo SAT en formato CTR000-CTR999.",
		},
		issuedAt: {
			type: ["string", "null"],
			description: "Fecha de expedición ISO yyyy-mm-dd.",
		},
		expiresAt: {
			type: ["string", "null"],
			description: "Fecha de vencimiento ISO yyyy-mm-dd (si aplica al tipo).",
		},
		ownerName: {
			type: ["string", "null"],
			description: "Nombre del propietario/titular tal como aparece en el documento.",
		},
		ownerRfc: {
			type: ["string", "null"],
			description: "RFC del propietario (12 o 13 caracteres) si aparece.",
		},
	},
	additionalProperties: false,
};

// ── Sanitizer de fields ───────────────────────────────────────────────────

function sanitizeTrailerFields(raw: unknown): ExtractedFields {
	if (typeof raw !== "object" || raw === null) return {};
	const r = raw as Record<string, unknown>;

	const out: ExtractedFields = {};

	if (typeof r.vin === "string" && r.vin.length === 17) out.vin = r.vin.toUpperCase();
	if (typeof r.plates_mx === "string") out.plates_mx = r.plates_mx.toUpperCase();
	if (typeof r.plates_us === "string") out.plates_us = r.plates_us.toUpperCase();
	if (typeof r.us_state === "string" && r.us_state.length === 2) {
		out.us_state = r.us_state.toUpperCase();
	}
	if (typeof r.make === "string") out.make = r.make;
	if (typeof r.model === "string") out.model = r.model;
	if (typeof r.modelYear === "number" && Number.isInteger(r.modelYear)) {
		out.modelYear = r.modelYear;
	}
	if (typeof r.manufacturer === "string") out.manufacturer = r.manufacturer;
	if (typeof r.ctrSubtype === "string" && /^CTR\d{3}$/i.test(r.ctrSubtype)) {
		out.ctrSubtype = r.ctrSubtype.toUpperCase();
	}
	if (typeof r.issuedAt === "string") out.issuedAt = r.issuedAt;
	if (typeof r.expiresAt === "string") out.expiresAt = r.expiresAt;
	if (typeof r.ownerName === "string" && r.ownerName.trim()) {
		out.ownerName = r.ownerName.trim();
	}
	if (typeof r.ownerRfc === "string" && /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(r.ownerRfc.trim())) {
		out.ownerRfc = r.ownerRfc.trim().toUpperCase();
	}

	return out;
}

// ── Config + wrapper ──────────────────────────────────────────────────────

const TRAILER_FALLBACK: BaseExtractionResult<TrailerDocumentType, ExtractedFields> = {
	type: null,
	confidence: "low",
	fields: {},
	summary: "No se pudo identificar el documento. Captúralo manualmente.",
};

const TRAILER_EXTRACTION_CONFIG: DocumentExtractionConfig<
	TrailerDocumentType,
	ExtractedFields
> = {
	entityName: "trailer",
	documentTypes: TRAILER_DOCUMENT_TYPES,
	systemPrompt: buildSystemPrompt(),
	fieldsJsonSchema: TRAILER_FIELDS_SCHEMA,
	sanitizeFields: sanitizeTrailerFields,
	fallback: TRAILER_FALLBACK,
};

/**
 * Wrapper que llama al cliente genérico con la config de trailers.
 * Mantiene la firma original que ya consumen `trailer-documents.service` y otros.
 */
export async function extractTrailerDocument(
	fileBuffer: Buffer,
	mimeType: string,
): Promise<ExtractionResult> {
	return extractDocument(fileBuffer, mimeType, TRAILER_EXTRACTION_CONFIG);
}
