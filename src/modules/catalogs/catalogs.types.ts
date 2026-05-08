import type {SatCatalogEntry} from "../sat/sat.types";

export type {SatCatalogEntry};

/**
 * Lo que vive en Redis. La envoltura permite saber cuándo fue la última
 * sincronización exitosa contra el provider, para servir respuestas con
 * marca de "stale" si una sync posterior falla.
 */
export interface SatCatalogCacheEntry {
	data: SatCatalogEntry[];
	lastSyncedAt: string; // ISO 8601
}

/**
 * Lo que devuelve el endpoint público.
 *
 * `stale === true` significa: el cliente está leyendo datos previamente
 * cacheados porque el último intento de refresco falló contra el proveedor.
 * Los datos son utilizables pero pueden estar desactualizados.
 */
export interface SatCatalogResponse {
	catalogKey: string;
	data: SatCatalogEntry[];
	lastSyncedAt: string;
	stale: boolean;
}
