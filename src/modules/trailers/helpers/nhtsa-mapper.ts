import type {
	NhtsaDecodeRawResponse,
	NhtsaDecodeRawResult,
} from "../../../infrastructure/http/nhtsaClient";

import {NHTSA_BODYCLASS_TO_CTR} from "../constants/nhtsaBodyClassToCtr.constants";
import {findManufacturerByName} from "../constants/trailerManufacturers.constants";
import {inferYearFromVin} from "./vin-validator";

// ── Tipos públicos del endpoint /decode-vin ───────────────────────────────

export type NhtsaDecodeStatus = "success" | "partial" | "failed";

export interface DecodeVinData {
	make: string | null;
	suggestedMakeCode: string | null;
	model: string | null;
	modelYear: number | null;
	manufacturer: string | null;
	bodyClass: string | null;
	suggestedCtrSubtype: string | null;
	gvwrLb: number | null;
}

export interface DecodeVinResponse {
	decodeStatus: NhtsaDecodeStatus;
	data: DecodeVinData | null;
	rawData: Record<string, unknown> | null;
	/**
	 * Cuando NHTSA devuelve un año que conflicta con la regla de posición 7
	 * del VIN, este warning explica al usuario que verifique. Ejemplo: VIN con
	 * posición 7 numérica (ciclo 1980-2009) pero NHTSA dice 2024.
	 */
	yearWarning?: {
		nhtsaYear: number;
		inferredYear: number;
		message: string;
	};
}

// ── Mapeo ──────────────────────────────────────────────────────────────────

/**
 * Toma el payload crudo de NHTSA y devuelve el shape público del endpoint.
 *
 * Reglas:
 * - Si Results está vacío → `decodeStatus: 'failed'`, data null.
 * - Si Make/Manufacturer faltan → `decodeStatus: 'partial'`, data parcial.
 * - Si todo OK → `decodeStatus: 'success'`.
 *
 * NUNCA lanza — el service trata cualquier error de red como `failed`.
 */
export function mapNhtsaResponse(
	raw: NhtsaDecodeRawResponse,
	vin?: string,
): DecodeVinResponse {
	const result = raw.Results?.[0];
	if (!result) {
		return {decodeStatus: "failed", data: null, rawData: serializeRaw(raw)};
	}

	const make = titleCase(trimOrNull(result.Make));
	const model = trimOrNull(result.Model);
	const nhtsaYear = parseYear(result.ModelYear);
	const manufacturer = titleCase(trimOrNull(result.Manufacturer));
	const bodyClass = trimOrNull(result.BodyClass);

	// Disambiguación de año por posición 7 del VIN (ISO 3779). Útil para
	// remolques pre-2010 donde NHTSA a veces ignora la regla.
	const inferred = vin ? inferYearFromVin(vin) : null;
	let modelYear = nhtsaYear;
	let yearWarning: DecodeVinResponse["yearWarning"];
	if (nhtsaYear && inferred && nhtsaYear !== inferred) {
		modelYear = inferred;
		yearWarning = {
			nhtsaYear,
			inferredYear: inferred,
			message: `NHTSA reporta ${nhtsaYear}, pero la regla de posición 7 del VIN sugiere ${inferred}. Verifica contra la placa física o registración.`,
		};
	}

	// Match en TRAILER_MANUFACTURERS por make o manufacturer
	const manufacturerEntry =
		(make ? findManufacturerByName(make) : undefined) ??
		(manufacturer ? findManufacturerByName(manufacturer) : undefined);
	const suggestedMakeCode = manufacturerEntry?.code ?? null;

	// Match en mapa de BodyClass → CTR
	const suggestedCtrSubtype = bodyClass
		? (NHTSA_BODYCLASS_TO_CTR[bodyClass] ?? null)
		: null;

	const data: DecodeVinData = {
		make,
		suggestedMakeCode,
		model,
		modelYear,
		manufacturer,
		bodyClass,
		suggestedCtrSubtype,
		gvwrLb: parseGvwrLowerBoundLb(result.GVWR),
	};

	// Si no obtuvimos make ni manufacturer, NHTSA no decodificó el VIN.
	const decodeStatus: NhtsaDecodeStatus =
		!make && !manufacturer ? "failed" : !make || !manufacturer ? "partial" : "success";

	return {decodeStatus, data, rawData: serializeRaw(raw), yearWarning};
}

// ── Helpers ────────────────────────────────────────────────────────────────

function trimOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length === 0 || trimmed.toLowerCase() === "not applicable"
		? null
		: trimmed;
}

/**
 * Title Case con preservación de abreviaciones comunes (LLC, INC, MFG, CO,
 * USA, MX). NHTSA devuelve todo en MAYÚSCULAS — esto lo hace legible.
 */
const PRESERVE_UPPER = new Set([
	"LLC", "INC", "MFG", "CO", "CORP", "LTD", "USA", "MX", "MEX", "CA",
	"DBA", "II", "III", "IV",
]);

function titleCase(value: string | null): string | null {
	if (!value) return value;
	return value
		.split(/\s+/)
		.map((word) => {
			if (!word) return word;
			const stripped = word.replace(/[^A-Z0-9]/gi, "");
			if (PRESERVE_UPPER.has(stripped.toUpperCase())) return word.toUpperCase();
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join(" ");
}

function parseYear(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const n = Number(value.trim());
	if (!Number.isFinite(n) || n < 1980 || n > 2100) return null;
	return Math.floor(n);
}

/**
 * NHTSA devuelve GVWR como string tipo:
 *   "Class 8: 33,001 - 60,000 lb (14,969 - 27,216 kg)"
 *   "Class 7: 26,001 - 33,000 lb (11,794 - 14,969 kg)"
 *
 * Sacamos el límite inferior en libras como aproximación útil. Si no
 * podemos parsear, devolvemos null.
 */
function parseGvwrLowerBoundLb(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const match = value.match(/([\d,]+)\s*-\s*[\d,]+\s*lb/i);
	if (!match) {
		// Algunos vehículos reportan un solo número: "33,000 lb"
		const single = value.match(/([\d,]+)\s*lb/i);
		if (!single) return null;
		const n = Number(single[1]!.replace(/,/g, ""));
		return Number.isFinite(n) ? n : null;
	}
	const n = Number(match[1]!.replace(/,/g, ""));
	return Number.isFinite(n) ? n : null;
}

function serializeRaw(raw: NhtsaDecodeRawResponse): Record<string, unknown> {
	// Devolvemos el payload completo en `rawData` por si el operador o el
	// debugging necesitan ver fields que no mapeamos (ABS, AirBagLocCurtain,
	// etc.). Lo serializamos a Record<string,unknown> defensivamente.
	return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}
