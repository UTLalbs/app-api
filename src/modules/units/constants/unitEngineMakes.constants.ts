// Catálogo base de fabricantes de motores diésel/gasolina/GNL para unidades
// motorizadas pesadas y medianas. Lista típica del mercado MX/US/EU/JP.
//
// Sincronizado con `app-web/src/lib/utils/unitEngineMakes.ts`.

export interface UnitEngineMakeEntry {
	code: string;
	name: string;
	country: "US" | "EU" | "JP" | "KR" | "CN" | "MX" | "OTHER";
	commonModels?: string[];
}

const RAW_ENGINE_MAKES: UnitEngineMakeEntry[] = [
	// ── Estados Unidos / Norteamérica ─────────────────────────────────────
	{code: "CUMMINS", name: "Cummins", country: "US", commonModels: ["X15", "X12", "ISX", "ISL", "ISB", "B6.7"]},
	{code: "DETROIT", name: "Detroit Diesel", country: "US", commonModels: ["DD15", "DD16", "DD13", "DD8", "Series 60"]},
	{code: "PACCAR", name: "PACCAR", country: "US", commonModels: ["MX-13", "MX-11", "PX-9", "PX-7"]},
	{code: "MACK", name: "Mack", country: "US", commonModels: ["MP8", "MP7", "MP10"]},
	{code: "INTERNATIONAL", name: "International (Navistar)", country: "US", commonModels: ["A26", "MaxxForce 13", "MaxxForce 11"]},
	{code: "CATERPILLAR", name: "Caterpillar", country: "US", commonModels: ["C15", "C13", "C9", "C7"]},
	{code: "FORD", name: "Ford Power Stroke", country: "US", commonModels: ["6.7L Power Stroke"]},
	{code: "GM_DURAMAX", name: "GM Duramax", country: "US", commonModels: ["6.6L Duramax"]},

	// ── Europa ────────────────────────────────────────────────────────────
	{code: "VOLVO", name: "Volvo Penta", country: "EU", commonModels: ["D13", "D16", "D11", "D8"]},
	{code: "MERCEDES_BENZ", name: "Mercedes-Benz", country: "EU", commonModels: ["OM457", "OM906", "OM471", "OM473"]},
	{code: "SCANIA", name: "Scania", country: "EU", commonModels: ["DC09", "DC13", "DC16"]},
	{code: "MAN", name: "MAN", country: "EU", commonModels: ["D26", "D38", "D20"]},
	{code: "DAF", name: "DAF (PACCAR)", country: "EU", commonModels: ["MX-13", "MX-11"]},
	{code: "IVECO", name: "Iveco", country: "EU", commonModels: ["Cursor 13", "Cursor 11", "Cursor 9"]},
	{code: "RENAULT_TRUCKS", name: "Renault Trucks", country: "EU", commonModels: ["DTI 13", "DTI 11"]},

	// ── Japón ─────────────────────────────────────────────────────────────
	{code: "HINO", name: "Hino", country: "JP", commonModels: ["J08", "J05", "A05", "A09"]},
	{code: "ISUZU", name: "Isuzu", country: "JP", commonModels: ["4HK1", "6HK1", "6WG1", "4JJ1"]},
	{code: "MITSUBISHI_FUSO", name: "Mitsubishi Fuso", country: "JP", commonModels: ["4M50", "4P10", "6M70"]},
	{code: "TOYOTA", name: "Toyota", country: "JP"},
	{code: "NISSAN", name: "Nissan", country: "JP"},

	// ── Corea ─────────────────────────────────────────────────────────────
	{code: "HYUNDAI", name: "Hyundai", country: "KR", commonModels: ["D6CC", "D6CB"]},
	{code: "DOOSAN", name: "Doosan", country: "KR", commonModels: ["DV15T", "DL08"]},

	// ── China ─────────────────────────────────────────────────────────────
	{code: "FOTON", name: "Foton (Cummins)", country: "CN"},
	{code: "WEICHAI", name: "Weichai", country: "CN", commonModels: ["WP10", "WP12", "WP13"]},
	{code: "SINOTRUK", name: "Sinotruk (MC)", country: "CN", commonModels: ["MC11", "MC13"]},

	// ── México ────────────────────────────────────────────────────────────
	{code: "DINA", name: "DINA", country: "MX"},
];

const OTHER_ENTRY: UnitEngineMakeEntry = {
	code: "OTHER",
	name: "Otro / No listado",
	country: "OTHER",
};

export const UNIT_ENGINE_MAKES: UnitEngineMakeEntry[] = [
	...RAW_ENGINE_MAKES.slice().sort((a, b) =>
		a.name.localeCompare(b.name, "es", {sensitivity: "base"}),
	),
	OTHER_ENTRY,
];

export const UNIT_ENGINE_MAKE_CODES: ReadonlySet<string> = new Set(
	UNIT_ENGINE_MAKES.map((m) => m.code),
);

export function isUnitEngineMakeCode(code: string): boolean {
	return UNIT_ENGINE_MAKE_CODES.has(code);
}

export function findUnitEngineMakeByName(name: string): UnitEngineMakeEntry | undefined {
	const norm = name.trim().toUpperCase();
	return UNIT_ENGINE_MAKES.find((m) => m.name.toUpperCase() === norm);
}
