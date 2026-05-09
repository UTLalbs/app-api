import Anthropic from "@anthropic-ai/sdk";

import {env} from "../../config/env";
import {logger} from "../../config/logger";
import {
	TRAILER_DOCUMENT_TYPE_CONFIG,
	TRAILER_DOCUMENT_TYPES,
	type TrailerDocumentType,
} from "../../modules/trailers/constants/trailerDocumentTypes.constants";
import type {
	ExtractedFields,
	ExtractionConfidence,
	ExtractionResult,
} from "../../modules/trailers/documents/trailer-documents.types";

// ── Cliente singleton ─────────────────────────────────────────────────────
// Lazy: solo inicializa si la key está configurada. Si no hay key, las llamadas
// devuelven el fallback "no se pudo identificar" — no rompemos el upload.

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
	if (client) return client;
	if (!env.ANTHROPIC_API_KEY) {
		return null;
	}
	client = new Anthropic({apiKey: env.ANTHROPIC_API_KEY});
	return client;
}

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

// ── Tool schema ───────────────────────────────────────────────────────────

const SUBMIT_EXTRACTION_TOOL: Anthropic.Tool = {
	name: "submit_extraction",
	description:
		"Reporta el tipo de documento identificado y los campos extraídos. Usa esta tool SIEMPRE para reportar el resultado.",
	input_schema: {
		type: "object",
		properties: {
			type: {
				type: ["string", "null"],
				enum: [...TRAILER_DOCUMENT_TYPES, null],
				description:
					"Código del tipo de documento del catálogo. null si no se puede identificar.",
			},
			confidence: {
				type: "string",
				enum: ["high", "medium", "low"],
				description: "Nivel de confianza en la identificación y extracción.",
			},
			fields: {
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
			},
			summary: {
				type: "string",
				description: "Resumen breve (≤120 caracteres) de lo identificado.",
			},
		},
		required: ["type", "confidence", "fields", "summary"],
	},
};

// ── API pública ────────────────────────────────────────────────────────────

const ALLOWED_PDF_MIME = "application/pdf";
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png"] as const;

const FALLBACK: ExtractionResult = {
	type: null,
	confidence: "low",
	fields: {},
	summary: "No se pudo identificar el documento. Captúralo manualmente.",
};

/**
 * Extrae el tipo y los campos clave de un documento (PDF o imagen) usando
 * Claude API con tool_choice forzado. Si la API falla, no está configurada,
 * o devuelve algo malformado, retorna un fallback "no identificable" en
 * lugar de lanzar — el upload del archivo no debe romperse por OCR.
 */
export async function extractTrailerDocument(
	fileBuffer: Buffer,
	mimeType: string,
): Promise<ExtractionResult> {
	const c = getClient();
	if (!c) {
		logger.warn("ANTHROPIC_API_KEY no configurada — extracción deshabilitada");
		return FALLBACK;
	}

	const documentBlock = buildDocumentBlock(fileBuffer, mimeType);
	if (!documentBlock) {
		logger.warn({mimeType}, "MIME type no soportado para extracción");
		return FALLBACK;
	}

	const startedAt = Date.now();

	try {
		const response = await c.messages.create(
			{
				model: env.ANTHROPIC_MODEL,
				max_tokens: 1024,
				system: buildSystemPrompt(),
				tools: [SUBMIT_EXTRACTION_TOOL],
				tool_choice: {type: "tool", name: "submit_extraction"},
				messages: [
					{
						role: "user",
						content: [
							documentBlock,
							{
								type: "text",
								text: "Identifica el tipo de este documento y extrae los campos clave. Llama a submit_extraction con el resultado.",
							},
						],
					},
				],
			},
			{timeout: 30_000},
		);

		const elapsed = Date.now() - startedAt;
		logger.info(
			{
				model: env.ANTHROPIC_MODEL,
				elapsedMs: elapsed,
				inputTokens: response.usage.input_tokens,
				outputTokens: response.usage.output_tokens,
			},
			"Trailer document extraction completed",
		);

		const toolBlock = response.content.find((b) => b.type === "tool_use");
		if (!toolBlock || toolBlock.type !== "tool_use") {
			logger.warn({stopReason: response.stop_reason}, "No tool_use block in response");
			return FALLBACK;
		}

		return parseToolInput(toolBlock.input);
	} catch (err) {
		logger.warn(
			{err, mimeType, elapsedMs: Date.now() - startedAt},
			"Anthropic extraction failed",
		);
		return FALLBACK;
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDocumentBlock(
	buffer: Buffer,
	mimeType: string,
): Anthropic.ContentBlockParam | null {
	const data = buffer.toString("base64");
	if (mimeType === ALLOWED_PDF_MIME) {
		return {
			type: "document",
			source: {type: "base64", media_type: "application/pdf", data},
		};
	}
	if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
		return {
			type: "image",
			source: {
				type: "base64",
				media_type: mimeType as "image/jpeg" | "image/png",
				data,
			},
		};
	}
	return null;
}

function parseToolInput(input: unknown): ExtractionResult {
	if (typeof input !== "object" || input === null) return FALLBACK;
	const i = input as Record<string, unknown>;

	const type = isValidType(i.type) ? (i.type as TrailerDocumentType) : null;
	const confidence = isValidConfidence(i.confidence)
		? (i.confidence as ExtractionConfidence)
		: "low";
	const fields = sanitizeFields(i.fields);
	const summary = typeof i.summary === "string" ? i.summary.slice(0, 200) : "";

	return {type, confidence, fields, summary};
}

function isValidType(v: unknown): boolean {
	if (v === null) return true;
	if (typeof v !== "string") return false;
	return Object.prototype.hasOwnProperty.call(TRAILER_DOCUMENT_TYPE_CONFIG, v);
}

function isValidConfidence(v: unknown): boolean {
	return v === "high" || v === "medium" || v === "low";
}

function sanitizeFields(raw: unknown): ExtractedFields {
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
