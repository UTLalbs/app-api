import {extractDocument} from "../../../infrastructure/http/anthropicClient";
import type {
	BaseExtractionResult,
	DocumentExtractionConfig,
} from "../../../infrastructure/http/document-extraction.types";

import {
	UNIT_DOCUMENT_TYPE_CONFIG,
	UNIT_DOCUMENT_TYPES,
	type UnitDocumentType,
} from "../constants/unitDocumentTypes.constants";

import type {ExtractedUnitFields, UnitExtractionResult} from "./unit-documents.types";

// ── System prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
	const lines: string[] = [
		"Eres un asistente experto en documentación de transporte de carga (México y Estados Unidos).",
		"",
		"Tu tarea: dado un documento (PDF o imagen) que pertenece a una unidad motorizada (tractocamión, camión unitario, vehículo ligero o sedan administrativo), identificar el tipo y extraer los campos clave.",
		"",
		"Tipos de documento posibles:",
	];

	for (const code of UNIT_DOCUMENT_TYPES) {
		const cfg = UNIT_DOCUMENT_TYPE_CONFIG[code];
		lines.push(`- ${code} (${cfg.country}): ${cfg.label}. Vence: ${cfg.hasExpiry ? "sí" : "no"}.`);
	}

	lines.push(
		"",
		"Reglas de extracción — sigue cada una con cuidado:",
		"",
		"IDENTIFICACIÓN:",
		"- VIN: EXACTAMENTE 17 caracteres alfanuméricos en mayúsculas, sin I/O/Q. Cuenta los caracteres antes de devolverlo. Si lees menos de 17 o más de 17, déjalo null y reporta confidence=medium.",
		"- engineNumber: número de motor del vehículo. ES DISTINTO del VIN — son campos separados en la tarjeta de circulación. NO copies el VIN aquí. Suele ser alfanumérico de 7-12 caracteres. Lee el número COMPLETO sin truncar.",
		"- Placas mexicanas: típicamente 7 caracteres alfanuméricos en placas modernas (formato 'AAA####' o '###AA##'). Lee la placa COMPLETA. Va en plates_mx.",
		"- Placas US: 1-8 caracteres alfanuméricos. Va en plates_us. El estado US (2 letras) va en us_state.",
		"",
		"VEHÍCULO:",
		"- make: marca/fabricante (ej. 'KENWORTH', 'PETERBILT', 'FREIGHTLINER', 'VOLVO').",
		"- model: nombre del modelo (ej. 'T680', 'CASCADIA', 'VNL'). NO pongas el año aquí.",
		"- modelYear: año del modelo, ENTERO entre 1980 y el año actual + 1. Va separado de model.",
		"- manufacturer: razón social del fabricante si aparece distinta de la marca.",
		"- color: color de la unidad si aparece (ej. 'Blanco', 'Rojo').",
		"",
		"CATÁLOGOS SAT:",
		"- satConfigCode: configuración SAT del autotransporte. Códigos válidos: 'VL', 'C2', 'C3', 'T2S1', 'T2S2', 'T3S2', 'T3S3', 'T3S2R2', 'T3S2R3'. Si la tarjeta dice 'CLASE: T3' u 'T3' suelto, devuelve 'T3' y nuestro sistema lo mapea.",
		"- sctPermitType: TIPO de permiso (categoría), formato 'TPAF' + 2 dígitos. NO confundir con el folio. Si la tarjeta dice 'Modalidad: General' o 'Carga General' devuelve 'TPAF01'. Si dice 'Transporte Privado' devuelve 'TPAF02'. Tabla de mapeo:",
		"  · 'General' / 'Carga General' → TPAF01",
		"  · 'Transporte Privado' / 'Privado' → TPAF02",
		"  · 'Materiales Peligrosos' / 'Especializada Peligrosos' → TPAF03",
		"  · 'Voluminosos' / 'Gran Peso' → TPAF04",
		"  · 'Fondos y Valores' → TPAF05",
		"  · 'Grúas' / 'Salvamento' → TPAF06",
		"  · 'Servicio Federal de Pasajeros' → TPAF13",
		"  · 'Servicio Federal de Turismo' → TPAF14",
		"  · 'Transporte Privado de Personas' → TPAF15",
		"  Si NO aparece nada que indique modalidad, déjalo null.",
		"- sctPermitNumber: FOLIO o NÚMERO del permiso, una cadena alfanumérica larga (ej. '0919UTA1808201602100100114', tiene 24-30 caracteres). Es DISTINTO de sctPermitType. Captúralo COMPLETO sin truncar. La etiqueta en la tarjeta suele decir 'Permiso de Ruta', 'No. de Permiso' o 'Folio'.",
		"- fuelTypeCodeSAT: código SAT 2 dígitos: '01' Gasolina, '02' Diésel, '03' GNC, '04' GNL, '05' GLP, '07' Eléctrico, '08' Hidrógeno.",
		"",
		"PROPIETARIO:",
		"- ownerName: razón social o nombre del propietario tal como aparece (ej. 'UNIDOS TRANSPORT & LOGISTIC MÉXICO, S.A. DE C.V.').",
		"- ownerRfc: RFC del propietario. Persona moral: 12 caracteres (ej. 'UTA140221EV7'). Persona física: 13 caracteres. Formato regex: `^[A-ZÑ&]{3,4}\\d{6}[A-Z\\d]{3}$`. NO copies aquí el número de motor — son campos separados en el documento.",
		"",
		"FECHAS:",
		"- issuedAt: fecha de expedición/emisión del documento, formato ISO 'yyyy-mm-dd'. Si la tarjeta dice '21 de septiembre de 2016' devuelve '2016-09-21'.",
		"- expiresAt: fecha de vencimiento si aplica al tipo, formato ISO 'yyyy-mm-dd'.",
		"",
		"GENERAL:",
		"- summary: una frase breve (≤120 caracteres) describiendo qué identificaste.",
		"- Devuelve solo los campos que el documento contiene de forma legible. No inventes datos.",
		"- Si un campo está parcialmente legible o tienes duda, déjalo null en lugar de adivinar.",
		"",
		"Confianza:",
		"- 'high' = puedes identificar el tipo con seguridad y los campos principales (VIN o placas) son legibles y completos.",
		"- 'medium' = identificas el tipo pero faltan o son dudosos algunos campos (incluido VIN truncado).",
		"- 'low' = no puedes identificar el tipo o el documento es ilegible.",
		"",
		"Si el documento NO corresponde a ningún tipo del catálogo, devuelve type=null con confidence=low y un summary explicando qué viste.",
	);

	return lines.join("\n");
}

// ── JSON schema del campo `fields` del tool ───────────────────────────────

const UNIT_FIELDS_SCHEMA: Record<string, unknown> = {
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
		make: {type: ["string", "null"], description: "Marca de la unidad."},
		model: {type: ["string", "null"], description: "Modelo."},
		modelYear: {
			type: ["integer", "null"],
			description: "Año del modelo (entero).",
		},
		manufacturer: {
			type: ["string", "null"],
			description: "Razón social del fabricante.",
		},
		color: {type: ["string", "null"], description: "Color de la unidad."},
		engineNumber: {type: ["string", "null"], description: "Número de motor."},
		satConfigCode: {
			type: ["string", "null"],
			description: "Configuración SAT (T3S2, C2, VL, etc.).",
		},
		sctPermitType: {
			type: ["string", "null"],
			description: "Código del TIPO de permiso SCT (TPAFxx, ej. TPAF02). DISTINTO al folio.",
		},
		sctPermitNumber: {
			type: ["string", "null"],
			description: "FOLIO/NÚMERO del permiso SCT, cadena alfanumérica larga (ej. 0919UTA1808201602100100114). Captura COMPLETO sin truncar.",
		},
		fuelTypeCodeSAT: {
			type: ["string", "null"],
			description: "Código SAT de combustible (2 dígitos).",
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

// ── Sanitizer ─────────────────────────────────────────────────────────────

function sanitizeUnitFields(raw: unknown): ExtractedUnitFields {
	if (typeof raw !== "object" || raw === null) return {};
	const r = raw as Record<string, unknown>;

	const out: ExtractedUnitFields = {};

	if (typeof r.vin === "string" && r.vin.length === 17) out.vin = r.vin.toUpperCase();
	if (typeof r.plates_mx === "string") out.plates_mx = r.plates_mx.toUpperCase();
	if (typeof r.plates_us === "string") out.plates_us = r.plates_us.toUpperCase();
	if (typeof r.us_state === "string" && r.us_state.length === 2) {
		out.us_state = r.us_state.toUpperCase();
	}
	if (typeof r.make === "string") out.make = r.make;
	if (typeof r.model === "string") {
		const trimmed = r.model.trim();
		// Rechaza model que sea solo un año (4 dígitos) — la tarjeta de
		// circulación mexicana suele no tener modelo separado del año.
		if (trimmed && !/^\d{4}$/.test(trimmed)) {
			out.model = trimmed;
		}
	}
	if (typeof r.modelYear === "number" && Number.isInteger(r.modelYear)) {
		out.modelYear = r.modelYear;
	}
	if (typeof r.manufacturer === "string") out.manufacturer = r.manufacturer;
	if (typeof r.color === "string" && r.color.trim()) out.color = r.color.trim();
	if (typeof r.engineNumber === "string" && r.engineNumber.trim()) {
		out.engineNumber = r.engineNumber.trim().toUpperCase();
	}
	if (typeof r.satConfigCode === "string" && /^[A-Z0-9]{2,8}$/i.test(r.satConfigCode)) {
		out.satConfigCode = r.satConfigCode.toUpperCase();
	}
	if (typeof r.sctPermitType === "string") {
		const trimmed = r.sctPermitType.trim();
		if (/^TPAF\d{2}$/i.test(trimmed)) {
			out.sctPermitType = trimmed.toUpperCase();
		} else {
			// Fallback: mapeo desde nombres descriptivos (Claude a veces devuelve
			// "GENERAL" o "Carga General" en vez del código TPAF01).
			const mapped = mapPermitNameToCode(trimmed);
			if (mapped) out.sctPermitType = mapped;
		}
	}
	if (typeof r.sctPermitNumber === "string") {
		const trimmed = r.sctPermitNumber.trim().toUpperCase();
		// Folio: alfanumérico de al menos 6 chars. Sin guiones ni espacios.
		if (/^[A-Z0-9]{6,40}$/.test(trimmed)) {
			out.sctPermitNumber = trimmed;
		}
	}
	if (typeof r.fuelTypeCodeSAT === "string" && /^\d{2}$/.test(r.fuelTypeCodeSAT)) {
		out.fuelTypeCodeSAT = r.fuelTypeCodeSAT;
	}
	if (typeof r.issuedAt === "string") out.issuedAt = r.issuedAt;
	if (typeof r.expiresAt === "string") out.expiresAt = r.expiresAt;
	if (typeof r.ownerName === "string" && r.ownerName.trim()) {
		out.ownerName = r.ownerName.trim();
	}
	if (
		typeof r.ownerRfc === "string" &&
		/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(r.ownerRfc.trim())
	) {
		out.ownerRfc = r.ownerRfc.trim().toUpperCase();
	}

	return out;
}

/** Mapea nombre descriptivo de modalidad SCT al código TPAFxx. */
function mapPermitNameToCode(raw: string): string | null {
	const norm = raw
		.toUpperCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
	if (norm.includes("CARGA GENERAL") || norm === "GENERAL") return "TPAF01";
	if (norm.includes("TRANSPORTE PRIVADO DE PERSONAS")) return "TPAF15";
	if (norm.includes("TRANSPORTE PRIVADO") || norm.includes("PRIVADO DE CARGA")) return "TPAF02";
	if (norm.includes("MATERIALES Y RESIDUOS PELIGROSOS") || norm.includes("PELIGROSOS")) return "TPAF03";
	if (norm.includes("VOLUMINOSOS") || norm.includes("GRAN PESO")) return "TPAF04";
	if (norm.includes("FONDOS") || norm.includes("VALORES")) return "TPAF05";
	if (norm.includes("GRUAS") || norm.includes("SALVAMENTO")) return "TPAF06";
	if (norm.includes("PAQUETERIA") || norm.includes("MENSAJERIA")) return "TPAF09";
	if (norm.includes("SERVICIO FEDERAL DE PASAJEROS") || norm.includes("PASAJE FEDERAL")) return "TPAF13";
	if (norm.includes("TURISMO")) return "TPAF14";
	return null;
}

// ── Config + wrapper ──────────────────────────────────────────────────────

const UNIT_FALLBACK: BaseExtractionResult<UnitDocumentType, ExtractedUnitFields> = {
	type: null,
	confidence: "low",
	fields: {},
	summary: "No se pudo identificar el documento. Captúralo manualmente.",
};

const UNIT_EXTRACTION_CONFIG: DocumentExtractionConfig<
	UnitDocumentType,
	ExtractedUnitFields
> = {
	entityName: "unit",
	documentTypes: UNIT_DOCUMENT_TYPES,
	systemPrompt: buildSystemPrompt(),
	fieldsJsonSchema: UNIT_FIELDS_SCHEMA,
	sanitizeFields: sanitizeUnitFields,
	fallback: UNIT_FALLBACK,
	// Más espacio que el default (1024) para no truncar folios SCT largos
	// y respuestas con muchos campos.
	maxTokens: 2048,
};

export async function extractUnitDocument(
	fileBuffer: Buffer,
	mimeType: string,
): Promise<UnitExtractionResult> {
	return extractDocument(fileBuffer, mimeType, UNIT_EXTRACTION_CONFIG);
}
