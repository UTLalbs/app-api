import Anthropic from "@anthropic-ai/sdk";

import {env} from "../../config/env";
import {logger} from "../../config/logger";

import type {
	BaseExtractionResult,
	DocumentExtractionConfig,
	ExtractionConfidence,
} from "./document-extraction.types";

// ── Cliente singleton ─────────────────────────────────────────────────────
// Lazy: solo inicializa si la key está configurada. Si no hay key, las llamadas
// devuelven el fallback del config — no rompemos el upload.

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
	if (client) return client;
	if (!env.ANTHROPIC_API_KEY) {
		return null;
	}
	client = new Anthropic({apiKey: env.ANTHROPIC_API_KEY});
	return client;
}

// ── MIME types soportados ─────────────────────────────────────────────────

const ALLOWED_PDF_MIME = "application/pdf";
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png"] as const;

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

// ── Tool builder ──────────────────────────────────────────────────────────

function buildSubmitTool<TType extends string>(
	documentTypes: readonly TType[],
	fieldsJsonSchema: Record<string, unknown>,
): Anthropic.Tool {
	return {
		name: "submit_extraction",
		description:
			"Reporta el tipo de documento identificado y los campos extraídos. Usa esta tool SIEMPRE para reportar el resultado.",
		input_schema: {
			type: "object",
			properties: {
				type: {
					type: ["string", "null"],
					enum: [...documentTypes, null],
					description:
						"Código del tipo de documento del catálogo. null si no se puede identificar.",
				},
				confidence: {
					type: "string",
					enum: ["high", "medium", "low"],
					description: "Nivel de confianza en la identificación y extracción.",
				},
				fields: fieldsJsonSchema,
				summary: {
					type: "string",
					description: "Resumen breve (≤120 caracteres) de lo identificado.",
				},
			},
			required: ["type", "confidence", "fields", "summary"],
		},
	};
}

// ── API pública ───────────────────────────────────────────────────────────

/**
 * Extrae el tipo y los campos clave de un documento (PDF o imagen) usando
 * Claude API con tool_choice forzado. Si la API falla, no está configurada,
 * o devuelve algo malformado, retorna el `config.fallback` en lugar de lanzar
 * — el upload del archivo no debe romperse por OCR.
 */
export async function extractDocument<TType extends string, TFields>(
	fileBuffer: Buffer,
	mimeType: string,
	config: DocumentExtractionConfig<TType, TFields>,
): Promise<BaseExtractionResult<TType, TFields>> {
	const c = getClient();
	if (!c) {
		logger.warn(
			{entityName: config.entityName},
			"ANTHROPIC_API_KEY no configurada — extracción deshabilitada",
		);
		return config.fallback;
	}

	const documentBlock = buildDocumentBlock(fileBuffer, mimeType);
	if (!documentBlock) {
		logger.warn(
			{entityName: config.entityName, mimeType},
			"MIME type no soportado para extracción",
		);
		return config.fallback;
	}

	const tool = buildSubmitTool(config.documentTypes, config.fieldsJsonSchema);
	const startedAt = Date.now();

	try {
		const response = await c.messages.create(
			{
				model: env.ANTHROPIC_MODEL,
				max_tokens: config.maxTokens ?? 1024,
				system: config.systemPrompt,
				tools: [tool],
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
				entityName: config.entityName,
				model: env.ANTHROPIC_MODEL,
				elapsedMs: elapsed,
				inputTokens: response.usage.input_tokens,
				outputTokens: response.usage.output_tokens,
			},
			"Document extraction completed",
		);

		const toolBlock = response.content.find((b) => b.type === "tool_use");
		if (!toolBlock || toolBlock.type !== "tool_use") {
			logger.warn(
				{entityName: config.entityName, stopReason: response.stop_reason},
				"No tool_use block in response",
			);
			return config.fallback;
		}

		return parseToolInput(toolBlock.input, config);
	} catch (err) {
		logger.warn(
			{entityName: config.entityName, err, mimeType, elapsedMs: Date.now() - startedAt},
			"Anthropic extraction failed",
		);
		return config.fallback;
	}
}

// ── Parser del output del tool ────────────────────────────────────────────

function parseToolInput<TType extends string, TFields>(
	input: unknown,
	config: DocumentExtractionConfig<TType, TFields>,
): BaseExtractionResult<TType, TFields> {
	if (typeof input !== "object" || input === null) return config.fallback;
	const i = input as Record<string, unknown>;

	const type = isValidType(i.type, config.documentTypes) ? (i.type as TType) : null;
	const confidence = isValidConfidence(i.confidence)
		? (i.confidence as ExtractionConfidence)
		: "low";
	const fields = config.sanitizeFields(i.fields);
	const summary = typeof i.summary === "string" ? i.summary.slice(0, 200) : "";

	return {type, confidence, fields, summary};
}

function isValidType<TType extends string>(
	v: unknown,
	documentTypes: readonly TType[],
): boolean {
	if (v === null) return true;
	if (typeof v !== "string") return false;
	return (documentTypes as readonly string[]).includes(v);
}

function isValidConfidence(v: unknown): boolean {
	return v === "high" || v === "medium" || v === "low";
}
