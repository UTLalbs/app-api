// Catálogo de configuraciones aplicables a una **unidad individual** (sin
// remolque enganchado). Las combinaciones T*S*, T*S*R* del SAT
// `c_ConfigAutotransporte` (T3S2, T3S3, T3S2R2, etc.) NO viven aquí porque
// dependen del flete: se determinan al armar el complemento Carta Porte
// según el(los) remolque(s) enganchado(s) en ese momento.
//
// La unidad solo declara su configuración propia (ejes, tipo, clase).
//
// Sincronizado con `app-web/src/lib/utils/unitConfigCatalog.ts`.

export type UnitConfigClass =
	| "tractor"          // tractocamiones (T2, T3)
	| "unitario"         // camiones unitarios (C2, C3)
	| "ligero"           // vehículos ligeros (VL)
	| "sedan";           // sedan/SUV administrativos

export interface UnitConfigCatalogEntry {
	code: string;
	label: string;
	class: UnitConfigClass;
	axles: number;
}

export const UNIT_CONFIG_CATALOG: UnitConfigCatalogEntry[] = [
	// ── Vehículo ligero ────────────────────────────────────────────────────
	{code: "VL", label: "Vehículo ligero", class: "ligero", axles: 2},

	// ── Sedan / SUV administrativo (categoría interna) ──────────────────────
	{code: "SEDAN", label: "Sedan / SUV administrativo", class: "sedan", axles: 2},

	// ── Camiones unitarios ─────────────────────────────────────────────────
	{code: "C2", label: "Camión unitario 2 ejes", class: "unitario", axles: 2},
	{code: "C3", label: "Camión unitario 3 ejes", class: "unitario", axles: 3},

	// ── Tractocamiones (sin remolque enganchado) ────────────────────────────
	{code: "T2", label: "Tractocamión 2 ejes", class: "tractor", axles: 2},
	{code: "T3", label: "Tractocamión 3 ejes", class: "tractor", axles: 3},
];

export const UNIT_CONFIG_CODES: ReadonlySet<string> = new Set(
	UNIT_CONFIG_CATALOG.map((c) => c.code),
);

export function isUnitConfigCode(code: string): boolean {
	return UNIT_CONFIG_CODES.has(code);
}

export function getUnitConfig(code: string): UnitConfigCatalogEntry | undefined {
	return UNIT_CONFIG_CATALOG.find((c) => c.code === code);
}

/** True si la configuración corresponde a un tractocamión (vs unitario, ligero o sedan). */
export function isTractorConfig(code: string): boolean {
	const cfg = getUnitConfig(code);
	return cfg?.class === "tractor";
}

/** True si la configuración corresponde a un vehículo ligero o administrativo. */
export function isLightVehicleConfig(code: string): boolean {
	const cfg = getUnitConfig(code);
	return cfg?.class === "ligero" || cfg?.class === "sedan";
}
