import {migration as m001OrganizationsTaxIds} from "./001-organizations-tax-ids";
import {migration as m002OrganizationsUnitSettings} from "./002-organizations-unit-settings";

export interface Migration {
	/** Nombre único e inmutable. Se persiste en la colección `_migrations`. */
	name: string;
	/** Función idempotente que aplica el cambio. */
	up: () => Promise<void>;
}

/**
 * Lista ordenada de migraciones. El orden importa: las migraciones se aplican
 * de arriba hacia abajo y solo las pendientes (no registradas en `_migrations`).
 *
 * Reglas:
 * 1. Cada migración tiene un `name` único e inmutable.
 * 2. Cada `up()` debe ser idempotente — si por accidente se corre dos veces,
 *    no debe duplicar datos ni romper nada.
 * 3. Nunca renombrar ni borrar una migración ya desplegada (rompe el tracking).
 *    Si necesita revertirse, agregar una nueva migración que la deshaga.
 */
export const migrations: Migration[] = [
	m001OrganizationsTaxIds,
	m002OrganizationsUnitSettings,
];
