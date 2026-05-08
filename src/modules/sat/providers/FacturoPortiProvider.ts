import {logger} from "../../../config/logger";
import {
	getCatalogRaw,
	getPostalCodeRaw,
	validateRfcRaw,
} from "../../../infrastructure/http/facturoportiClient";
import {AppError} from "../../../shared/errors/AppError";

import type {
	PostalCodeResult,
	RfcValidationInput,
	RfcValidationResult,
	SatCatalogEntry,
} from "../sat.types";
import type {SatProvider} from "./SatProvider";

// Mapeo de claves canónicas SAT → claves numéricas internas de FacturoPorTi.
// Si llega una clave no listada, getCatalog lanza un error explícito.
const CATALOG_KEY_TO_FACTUROPORTI_NUMERIC: Record<string, number> = {
	c_RegimenFiscal: 8,
	c_ConfigAutotransporte: 67,
	c_SubTipoRem: 68,
};

export class FacturoPortiProvider implements SatProvider {
	async getPostalCode(cp: string): Promise<PostalCodeResult[]> {
		logger.info({cp}, "FacturoPorTi: consultando código postal");
		const raw = await getPostalCodeRaw(cp);
		return raw.map((item) => ({
			claveColonia: item.claveColonia,
			colonia: item.colonia,
			claveLocalidad: item.claveLocalidad,
			localidad: item.localidad,
			claveMunicipio: item.claveMunicipio,
			municipio: item.municipio,
			claveEstado: item.claveEstado,
			estado: item.estado,
			codigoPostal: item.codigoPostal,
		}));
	}

	async validateRfc(input: RfcValidationInput): Promise<RfcValidationResult> {
		logger.info({rfc: input.rfc}, "FacturoPorTi: validando RFC");
		const response = await validateRfcRaw({
			rfc: input.rfc,
			nombreRazonSocial: input.nombreRazonSocial,
			regimenFiscal: input.regimenFiscal ?? "",
			codigoPostal: input.codigoPostal,
		});

		const result = response.rfc?.[0];
		if (!result) {
			throw new AppError(
				"Respuesta inesperada del servicio de validación de RFC",
				502,
				"EXTERNAL_SERVICE_ERROR",
			);
		}

		return {
			esValido: result.esValido,
			estatus: result.estatus,
			usosCFDIPermitidos: result.usosCFDIPermitidos ?? null,
		};
	}

	async getCatalog(catalogKey: string): Promise<SatCatalogEntry[]> {
		const numericKey = CATALOG_KEY_TO_FACTUROPORTI_NUMERIC[catalogKey];
		if (numericKey === undefined) {
			throw new AppError(
				`FacturoPorTi no soporta el catálogo "${catalogKey}"`,
				400,
				"SAT_CATALOG_UNSUPPORTED",
			);
		}

		logger.info({catalogKey, numericKey}, "FacturoPorTi: consultando catálogo");
		const raw = await getCatalogRaw(numericKey);
		return raw.map((entry) => ({
			code: entry.codigo,
			description: entry.descripcion,
		}));
	}
}
