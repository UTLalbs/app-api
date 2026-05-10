/**
 * Tipos compartidos para extracción de documentos vía Claude (Anthropic).
 * Cada módulo (trailers, units, etc.) provee su propio `DocumentExtractionConfig`
 * y consume `extractDocument()` del cliente genérico.
 */

export type ExtractionConfidence = "high" | "medium" | "low";

export interface BaseExtractionResult<TType extends string, TFields> {
	type: TType | null;
	confidence: ExtractionConfidence;
	fields: TFields;
	summary: string;
}

/**
 * Configuración por entidad para `extractDocument()`.
 * - `entityName` se usa solo en logs (ej. "trailer", "unit").
 * - `documentTypes` alimenta el enum del JSON schema del tool y la validación del output.
 * - `systemPrompt` se calcula una sola vez al construir el config (no por llamada).
 * - `fieldsJsonSchema` es el sub-schema para la propiedad `fields` del tool.
 * - `sanitizeFields` valida y normaliza el input crudo del tool a un shape tipado.
 * - `fallback` se devuelve si la API falla, no hay key, MIME no soportado, etc.
 */
export interface DocumentExtractionConfig<TType extends string, TFields> {
	entityName: string;
	documentTypes: readonly TType[];
	systemPrompt: string;
	fieldsJsonSchema: Record<string, unknown>;
	sanitizeFields: (raw: unknown) => TFields;
	fallback: BaseExtractionResult<TType, TFields>;
	maxTokens?: number;
}
