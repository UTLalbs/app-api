// Catálogo base de fabricantes de unidades motorizadas. El usuario puede
// capturar marcas libres también; este catálogo facilita autocomplete y match
// con NHTSA decode.
//
// Sincronizado con `app-web/src/lib/utils/unitManufacturers.ts` —
// SIEMPRE cambiar en pareja.

export type UnitManufacturerCountry = "US" | "MX" | "CA" | "EU" | "JP" | "KR" | "CN" | "OTHER";

export interface UnitManufacturerCatalogEntry {
	code: string;
	name: string;
	country: UnitManufacturerCountry;
	aliases?: string[];
}

const RAW_UNIT_MANUFACTURERS: UnitManufacturerCatalogEntry[] = [
	// ── Estados Unidos / Norteamérica ─────────────────────────────────────
	{code: "KENWORTH", name: "Kenworth", country: "US", aliases: ["Kenworth Truck Company", "PACCAR Kenworth"]},
	{code: "PETERBILT", name: "Peterbilt", country: "US", aliases: ["Peterbilt Motors Company", "PACCAR Peterbilt"]},
	{code: "FREIGHTLINER", name: "Freightliner", country: "US", aliases: ["Freightliner Trucks", "Daimler Freightliner"]},
	{code: "MACK", name: "Mack Trucks", country: "US", aliases: ["Mack"]},
	{code: "INTERNATIONAL", name: "International", country: "US", aliases: ["Navistar International", "International Truck"]},
	{code: "WESTERN_STAR", name: "Western Star", country: "US", aliases: ["Western Star Trucks", "Daimler Western Star"]},
	{code: "VOLVO_TRUCKS", name: "Volvo Trucks", country: "US", aliases: ["Volvo", "Volvo Truck Corporation"]},
	{code: "FORD", name: "Ford", country: "US", aliases: ["Ford Motor Company", "Ford Trucks"]},
	{code: "RAM", name: "Ram", country: "US", aliases: ["Ram Trucks", "Dodge Ram"]},
	{code: "CHEVROLET", name: "Chevrolet", country: "US", aliases: ["Chevy", "GM Chevrolet"]},
	{code: "GMC", name: "GMC", country: "US", aliases: ["General Motors GMC"]},
	{code: "TESLA", name: "Tesla", country: "US", aliases: ["Tesla Semi", "Tesla Inc"]},
	{code: "NIKOLA", name: "Nikola", country: "US", aliases: ["Nikola Motor", "Nikola Corporation"]},

	// ── México ────────────────────────────────────────────────────────────
	{code: "DINA", name: "DINA", country: "MX", aliases: ["Dina Camiones", "Diésel Nacional"]},

	// ── Europa ────────────────────────────────────────────────────────────
	{code: "MERCEDES_BENZ", name: "Mercedes-Benz", country: "EU", aliases: ["Mercedes", "Mercedes-Benz Trucks", "Daimler Mercedes"]},
	{code: "SCANIA", name: "Scania", country: "EU", aliases: ["Scania AB"]},
	{code: "IVECO", name: "Iveco", country: "EU", aliases: ["Iveco S.p.A."]},
	{code: "MAN", name: "MAN", country: "EU", aliases: ["MAN Truck & Bus"]},
	{code: "DAF", name: "DAF", country: "EU", aliases: ["DAF Trucks", "PACCAR DAF"]},
	{code: "RENAULT_TRUCKS", name: "Renault Trucks", country: "EU", aliases: ["Renault"]},

	// ── Japón ─────────────────────────────────────────────────────────────
	{code: "HINO", name: "Hino", country: "JP", aliases: ["Hino Motors", "Toyota Hino"]},
	{code: "ISUZU", name: "Isuzu", country: "JP", aliases: ["Isuzu Motors"]},
	{code: "MITSUBISHI_FUSO", name: "Mitsubishi Fuso", country: "JP", aliases: ["Fuso", "Daimler Fuso", "Mitsubishi Canter"]},
	{code: "UD_TRUCKS", name: "UD Trucks", country: "JP", aliases: ["UD", "Nissan Diesel"]},
	{code: "TOYOTA", name: "Toyota", country: "JP", aliases: ["Toyota Motor"]},
	{code: "NISSAN", name: "Nissan", country: "JP", aliases: ["Nissan Motor"]},

	// ── Corea ─────────────────────────────────────────────────────────────
	{code: "HYUNDAI", name: "Hyundai", country: "KR", aliases: ["Hyundai Motor", "Hyundai Truck"]},
	{code: "KIA", name: "Kia", country: "KR", aliases: ["Kia Motors"]},

	// ── China ─────────────────────────────────────────────────────────────
	{code: "FOTON", name: "Foton", country: "CN", aliases: ["Foton Motor", "BAIC Foton"]},
	{code: "JAC_MOTORS", name: "JAC Motors", country: "CN", aliases: ["JAC", "Anhui Jianghuai"]},
	{code: "SINOTRUK", name: "Sinotruk", country: "CN", aliases: ["Sino Truk", "CNHTC"]},

	// ── Genérico ──────────────────────────────────────────────────────────
];

const OTHER_ENTRY: UnitManufacturerCatalogEntry = {
	code: "OTHER",
	name: "Otro / No listado",
	country: "OTHER",
};

export const UNIT_MANUFACTURERS: UnitManufacturerCatalogEntry[] = [
	...RAW_UNIT_MANUFACTURERS.slice().sort((a, b) =>
		a.name.localeCompare(b.name, "es", {sensitivity: "base"}),
	),
	OTHER_ENTRY,
];

export const UNIT_MANUFACTURER_CODES: ReadonlySet<string> = new Set(
	UNIT_MANUFACTURERS.map((m) => m.code),
);

export function isUnitManufacturerCode(code: string): boolean {
	return UNIT_MANUFACTURER_CODES.has(code);
}

/** Match libre: por nombre exacto o cualquier alias (case-insensitive). */
export function findUnitManufacturerByName(
	name: string,
): UnitManufacturerCatalogEntry | undefined {
	const norm = name.trim().toUpperCase();
	return UNIT_MANUFACTURERS.find((m) => {
		if (m.name.toUpperCase() === norm) return true;
		return (m.aliases ?? []).some((a) => a.toUpperCase() === norm);
	});
}
