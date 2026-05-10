/**
 * Whitelist de catálogos SAT que el módulo `catalogs` expone y sincroniza.
 *
 * El mapeo de cada `catalogKey` a la representación específica del proveedor
 * externo (ej. clave numérica de FacturoPorTi) vive **dentro del provider**
 * (`modules/sat/providers/FacturoPortiProvider.ts`) — aquí solo declaramos
 * cuáles catálogos son válidos en este sistema.
 *
 * Para agregar un catálogo nuevo:
 *   1. Agregar la key aquí.
 *   2. Asegurar que el provider activo lo soporte.
 *   3. (Opcional) Forzar resync con `syncSatCatalog(key)`.
 */
export const SAT_CATALOG_KEYS = [
	"c_RegimenFiscal",
	"c_ConfigAutotransporte",
	"c_SubTipoRem",
	"c_TipoPermiso",
	"c_TipoCombustible",
] as const;

export type SatCatalogKey = (typeof SAT_CATALOG_KEYS)[number];

export function isSatCatalogKey(value: string): value is SatCatalogKey {
	return (SAT_CATALOG_KEYS as readonly string[]).includes(value);
}

/** Cache key en Redis. */
export function satCatalogCacheKey(key: SatCatalogKey): string {
	return `sat:catalog:${key}`;
}

/** TTL en segundos. 7 días — salvaguarda contra outages prolongados. */
export const SAT_CATALOG_TTL_SECONDS = 7 * 24 * 60 * 60;
