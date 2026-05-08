import {logger} from "../../config/logger";
import {
	cacheGet,
	cacheSet,
} from "../../infrastructure/cache/cache.service";
import {AppError} from "../../shared/errors/AppError";
import {getSatCatalog as getCatalogFromProvider} from "../sat/sat.service";

import {
	SAT_CATALOG_KEYS,
	SAT_CATALOG_TTL_SECONDS,
	satCatalogCacheKey,
	type SatCatalogKey,
} from "./constants/sat-catalogs.constants";
import type {SatCatalogCacheEntry, SatCatalogResponse} from "./catalogs.types";

/**
 * Devuelve un catálogo SAT, sirviendo desde Redis si hay cache hit. Si no, lo
 * trae del provider, lo cachea (TTL 7 días) y lo regresa. Si el provider falla
 * y hay un valor cacheado (aunque expirado por la lógica del cron sync), lo
 * sirve marcado como `stale: true`.
 */
export async function getSatCatalog(
	catalogKey: SatCatalogKey,
): Promise<SatCatalogResponse> {
	const cacheKey = satCatalogCacheKey(catalogKey);
	const cached = await cacheGet<SatCatalogCacheEntry>(cacheKey);

	if (cached) {
		return {
			catalogKey,
			data: cached.data,
			lastSyncedAt: cached.lastSyncedAt,
			stale: false,
		};
	}

	// Cache miss — intenta sync on-demand
	try {
		const fresh = await syncSatCatalog(catalogKey);
		return {
			catalogKey,
			data: fresh.data,
			lastSyncedAt: fresh.lastSyncedAt,
			stale: false,
		};
	} catch (err) {
		// Reintenta lectura por si entre tanto otro proceso pobló la cache
		const recovered = await cacheGet<SatCatalogCacheEntry>(cacheKey);
		if (recovered) {
			logger.warn(
				{catalogKey, err},
				"Provider failed but stale cache available — serving stale",
			);
			return {
				catalogKey,
				data: recovered.data,
				lastSyncedAt: recovered.lastSyncedAt,
				stale: true,
			};
		}
		logger.error(
			{catalogKey, err},
			"Provider failed and no cache available",
		);
		throw new AppError(
			`Catálogo SAT "${catalogKey}" no disponible — sin cache y proveedor inalcanzable`,
			503,
			"SAT_CATALOG_UNAVAILABLE",
		);
	}
}

/**
 * Fuerza un refresh contra el proveedor y actualiza Redis. Se llama desde el
 * cron job o manualmente para invalidar.
 */
export async function syncSatCatalog(
	catalogKey: SatCatalogKey,
): Promise<SatCatalogCacheEntry> {
	const data = await getCatalogFromProvider(catalogKey);
	const entry: SatCatalogCacheEntry = {
		data,
		lastSyncedAt: new Date().toISOString(),
	};

	await cacheSet(satCatalogCacheKey(catalogKey), entry, SAT_CATALOG_TTL_SECONDS);

	logger.info(
		{catalogKey, count: data.length},
		"SAT catalog synced",
	);

	return entry;
}

/**
 * Sincroniza todos los catálogos del whitelist. Errores individuales no
 * detienen el resto. Devuelve resumen.
 */
export async function syncAllSatCatalogs(): Promise<{
	synced: SatCatalogKey[];
	failed: Array<{key: SatCatalogKey; error: string}>;
}> {
	const synced: SatCatalogKey[] = [];
	const failed: Array<{key: SatCatalogKey; error: string}> = [];

	for (const key of SAT_CATALOG_KEYS) {
		try {
			await syncSatCatalog(key);
			synced.push(key);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failed.push({key, error: message});
			logger.error({err, catalogKey: key}, "SAT catalog sync failed");
		}
	}

	return {synced, failed};
}
