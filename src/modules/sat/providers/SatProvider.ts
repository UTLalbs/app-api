import type {
	PostalCodeResult,
	RfcValidationInput,
	RfcValidationResult,
	SatCatalogEntry,
} from "../sat.types";

// ── Interfaz de proveedor SAT ──────────────────────────────────────────────
// Contrato agnóstico al vendor. Cualquier integración (FacturoPorTi, SW,
// PAC propio, etc.) implementa esta interfaz. La capa de servicio nunca
// llama directamente a un cliente HTTP — siempre usa esta interfaz.

export interface SatProvider {
	/**
	 * Consulta los datos de un código postal mexicano.
	 * Devuelve una o más colonias asociadas al CP.
	 */
	getPostalCode(cp: string): Promise<PostalCodeResult[]>;

	/**
	 * Valida un RFC contra el SAT.
	 */
	validateRfc(input: RfcValidationInput): Promise<RfcValidationResult>;

	/**
	 * Consulta un catálogo del SAT por su clave canónica
	 * (ej. "c_SubTipoRem", "c_RegimenFiscal", "c_ConfigAutotransporte").
	 * Lanza si el proveedor no soporta el catálogo solicitado.
	 */
	getCatalog(catalogKey: string): Promise<SatCatalogEntry[]>;
}
