import type {
	NhtsaDecodeRawResponse,
} from "../../../infrastructure/http/nhtsaClient";
import {inferYearFromVin} from "../../trailers/helpers/vin-validator";

import {findUnitManufacturerByName} from "../constants/unitManufacturers.constants";
import {
	UNIT_FUEL_TYPES,
	type UnitFuelType,
} from "../constants/unitFuelTypes.constants";
import type {DriveAxleConfig, TransmissionType} from "../units.types";

// ── Tipos públicos del endpoint /decode-vin ───────────────────────────────

export type NhtsaDecodeStatus = "success" | "partial" | "failed";

export interface DecodeUnitVinData {
	make: string | null;
	suggestedMakeCode: string | null;
	model: string | null;
	modelYear: number | null;
	manufacturer: string | null;
	bodyClass: string | null;
	gvwrLb: number | null;

	// Específicos de unidades motorizadas
	suggestedFuelType: UnitFuelType | null;
	engineModel: string | null;
	engineDisplacementL: number | null;
	enginePowerHp: number | null;
	suggestedTransmissionType: TransmissionType | null;
	suggestedDriveAxleConfig: DriveAxleConfig | null;
}

export interface DecodeUnitVinResponse {
	decodeStatus: NhtsaDecodeStatus;
	data: DecodeUnitVinData | null;
	rawData: Record<string, unknown> | null;
	yearWarning?: {
		nhtsaYear: number;
		inferredYear: number;
		message: string;
	};
}

// ── Mapeo ──────────────────────────────────────────────────────────────────

export function mapNhtsaUnitResponse(
	raw: NhtsaDecodeRawResponse,
	vin?: string,
): DecodeUnitVinResponse {
	const result = raw.Results?.[0] as Record<string, unknown> | undefined;
	if (!result) {
		return {decodeStatus: "failed", data: null, rawData: serializeRaw(raw)};
	}

	const make = titleCase(trimOrNull(result.Make));
	const model = trimOrNull(result.Model);
	const nhtsaYear = parseYear(result.ModelYear);
	const manufacturer = titleCase(trimOrNull(result.Manufacturer));
	const bodyClass = trimOrNull(result.BodyClass);

	const inferred = vin ? inferYearFromVin(vin) : null;
	let modelYear = nhtsaYear;
	let yearWarning: DecodeUnitVinResponse["yearWarning"];
	if (nhtsaYear && inferred && nhtsaYear !== inferred) {
		modelYear = inferred;
		yearWarning = {
			nhtsaYear,
			inferredYear: inferred,
			message: `NHTSA reporta ${nhtsaYear}, pero la regla de posición 7 del VIN sugiere ${inferred}. Verifica contra la placa física o registración.`,
		};
	}

	const manufacturerEntry =
		(make ? findUnitManufacturerByName(make) : undefined) ??
		(manufacturer ? findUnitManufacturerByName(manufacturer) : undefined);
	const suggestedMakeCode = manufacturerEntry?.code ?? null;

	const data: DecodeUnitVinData = {
		make,
		suggestedMakeCode,
		model,
		modelYear,
		manufacturer,
		bodyClass,
		gvwrLb: parseGvwrLowerBoundLb(result.GVWR),
		suggestedFuelType: mapFuelType(trimOrNull(result.FuelTypePrimary)),
		engineModel: trimOrNull(result.EngineModel),
		engineDisplacementL: parseFloatOrNull(result.DisplacementL),
		enginePowerHp: parseFloatOrNull(result.EngineHP),
		suggestedTransmissionType: mapTransmissionType(trimOrNull(result.TransmissionStyle)),
		suggestedDriveAxleConfig: mapDriveType(trimOrNull(result.DriveType)),
	};

	const decodeStatus: NhtsaDecodeStatus =
		!make && !manufacturer ? "failed" : !make || !manufacturer ? "partial" : "success";

	return {decodeStatus, data, rawData: serializeRaw(raw), yearWarning};
}

// ── Mappers específicos ───────────────────────────────────────────────────

function mapFuelType(value: string | null): UnitFuelType | null {
	if (!value) return null;
	const norm = value.toLowerCase();
	if (norm.includes("diesel")) return "diesel";
	if (norm.includes("gasoline") || norm.includes("petrol")) return "gasoline";
	if (norm.includes("compressed natural gas") || norm.includes("cng")) return "cng";
	if (norm.includes("liquefied natural gas") || norm.includes("lng")) return "lng";
	if (norm.includes("liquefied petroleum") || norm.includes("propane") || norm === "lpg") {
		return "lpg";
	}
	if (norm.includes("electric") && !norm.includes("hybrid")) return "electric";
	if (norm.includes("hybrid")) return "hybrid";
	if (norm.includes("hydrogen")) return "hydrogen";
	// Match contra labels conocidos como respaldo
	const entry = UNIT_FUEL_TYPES.find((f) => f.label.toLowerCase().includes(norm));
	return entry?.type ?? null;
}

function mapTransmissionType(value: string | null): TransmissionType | null {
	if (!value) return null;
	const norm = value.toLowerCase();
	if (norm.includes("automatic")) return "automatic";
	if (norm.includes("automated") || norm.includes("amt")) return "automated_manual";
	if (norm.includes("manual")) return "manual";
	return null;
}

function mapDriveType(value: string | null): DriveAxleConfig | null {
	if (!value) return null;
	const norm = value.replace(/\s+/g, "").toLowerCase();
	const candidates: DriveAxleConfig[] = ["4x2", "6x2", "6x4", "8x4", "8x6", "4x4"];
	for (const cfg of candidates) {
		if (norm.includes(cfg)) return cfg;
	}
	return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function trimOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length === 0 || trimmed.toLowerCase() === "not applicable"
		? null
		: trimmed;
}

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

function parseFloatOrNull(value: unknown): number | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function parseGvwrLowerBoundLb(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const match = value.match(/([\d,]+)\s*-\s*[\d,]+\s*lb/i);
	if (!match) {
		const single = value.match(/([\d,]+)\s*lb/i);
		if (!single) return null;
		const n = Number(single[1]!.replace(/,/g, ""));
		return Number.isFinite(n) ? n : null;
	}
	const n = Number(match[1]!.replace(/,/g, ""));
	return Number.isFinite(n) ? n : null;
}

function serializeRaw(raw: NhtsaDecodeRawResponse): Record<string, unknown> {
	return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}
