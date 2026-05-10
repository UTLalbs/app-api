// Códigos del catálogo SAT `c_TipoCombustible`. Mientras el provider de
// `catalogs` no expone esta key (faltan IDs numéricos de FacturoPorTi),
// estas constantes son la fuente de verdad local para validación.
//
// Cuando el provider tenga los IDs correctos, el módulo `units` puede
// consultar `getSatCatalog('c_TipoCombustible')` y este archivo queda como
// seed/fallback.
//
// Sincronizado con `app-web/src/lib/constants/unitFuelTypes.ts`.

export type UnitFuelType =
	| "diesel"
	| "gasoline"
	| "cng"
	| "lng"
	| "lpg"
	| "non_fossil"
	| "electric"
	| "hybrid"
	| "hydrogen";

/** Mapeo dominio → código SAT `c_TipoCombustible`. */
export const UNIT_FUEL_TYPE_TO_SAT_CODE: Record<UnitFuelType, string> = {
	gasoline: "01",
	diesel: "02",
	cng: "03",       // Gas Natural Comprimido
	lng: "04",       // Gas Natural Licuado
	lpg: "05",       // Gas Licuado de Petróleo
	non_fossil: "06",
	electric: "07",
	hydrogen: "08",
	hybrid: "02",    // SAT no tiene código directo para híbrido — se reporta como diesel/gasoline según motor primario
};

export interface UnitFuelTypeEntry {
	type: UnitFuelType;
	satCode: string;
	label: string;
	/** True si requiere campos relacionados con motor de combustión interna. */
	hasCombustionEngine: boolean;
}

export const UNIT_FUEL_TYPES: UnitFuelTypeEntry[] = [
	{type: "diesel", satCode: "02", label: "Diésel", hasCombustionEngine: true},
	{type: "gasoline", satCode: "01", label: "Gasolina", hasCombustionEngine: true},
	{type: "cng", satCode: "03", label: "Gas Natural Comprimido (GNC)", hasCombustionEngine: true},
	{type: "lng", satCode: "04", label: "Gas Natural Licuado (GNL)", hasCombustionEngine: true},
	{type: "lpg", satCode: "05", label: "Gas Licuado de Petróleo (GLP)", hasCombustionEngine: true},
	{type: "non_fossil", satCode: "06", label: "Combustible no fósil", hasCombustionEngine: true},
	{type: "electric", satCode: "07", label: "Eléctrico", hasCombustionEngine: false},
	{type: "hydrogen", satCode: "08", label: "Hidrógeno", hasCombustionEngine: false},
	{type: "hybrid", satCode: "02", label: "Híbrido (diésel/gasolina + eléctrico)", hasCombustionEngine: true},
];

export const UNIT_FUEL_TYPE_VALUES: UnitFuelType[] = UNIT_FUEL_TYPES.map((f) => f.type);

export const UNIT_FUEL_SAT_CODES: ReadonlySet<string> = new Set(
	UNIT_FUEL_TYPES.map((f) => f.satCode),
);

export function isUnitFuelType(value: string): value is UnitFuelType {
	return UNIT_FUEL_TYPE_VALUES.includes(value as UnitFuelType);
}

export function isUnitFuelSatCode(code: string): boolean {
	return UNIT_FUEL_SAT_CODES.has(code);
}

export function getUnitFuelEntry(type: UnitFuelType): UnitFuelTypeEntry | undefined {
	return UNIT_FUEL_TYPES.find((f) => f.type === type);
}

// ── c_TipoPermiso (SCT autotransporte federal) ────────────────────────────
// Subset de los códigos más comunes. La lista oficial completa la mantiene SAT.
// Cuando el provider de `catalogs` exponga `c_TipoPermiso`, esta constante queda
// como seed/fallback.

export interface UnitSctPermitEntry {
	code: string;
	label: string;
}

export const UNIT_SCT_PERMITS: UnitSctPermitEntry[] = [
	{code: "TPAF01", label: "Autotransporte Federal de Carga General"},
	{code: "TPAF02", label: "Transporte Privado de Carga"},
	{code: "TPAF03", label: "Autotransporte Federal de Carga Especializada de materiales y residuos peligrosos"},
	{code: "TPAF04", label: "Autotransporte Federal de Carga Especializada de objetos voluminosos o de gran peso"},
	{code: "TPAF05", label: "Autotransporte Federal de Carga Especializada de fondos y valores"},
	{code: "TPAF06", label: "Autotransporte Federal de Carga Especializada de grúas industriales y de arrastre, salvamento y depósito de vehículos"},
	{code: "TPAF07", label: "Servicio Auxiliar de Arrastre en las Vías Generales de Comunicación"},
	{code: "TPAF08", label: "Servicio Auxiliar de Servicios de Arrastre, Salvamento y Depósito de Vehículos en las Vías Generales de Comunicación"},
	{code: "TPAF09", label: "Servicio de Paquetería y Mensajería en las Vías Generales de Comunicación"},
	{code: "TPAF10", label: "Servicio de Empresas Transportistas Inscritas en el Programa OEA / FAST"},
	{code: "TPAF11", label: "Servicio de autotransporte internacional de carga de largo recorrido"},
	{code: "TPAF12", label: "Servicio de autotransporte internacional de carga especializada de materiales y residuos peligrosos de largo recorrido"},
	{code: "TPAF13", label: "Servicio Federal de Pasajeros"},
	{code: "TPAF14", label: "Servicio Federal de Turismo"},
	{code: "TPAF15", label: "Transporte Privado de Personas"},
];

export const UNIT_SCT_PERMIT_CODES: ReadonlySet<string> = new Set(
	UNIT_SCT_PERMITS.map((p) => p.code),
);

export function isUnitSctPermitCode(code: string): boolean {
	return UNIT_SCT_PERMIT_CODES.has(code);
}
