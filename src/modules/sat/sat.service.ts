import {NotFoundError} from "../../shared/errors/AppError";

import {FacturoPortiProvider} from "./providers/FacturoPortiProvider";
import type {SatProvider} from "./providers/SatProvider";
import type {
	MappedAddress,
	PostalCodeResult,
	RfcValidationInput,
	RfcValidationResult,
	SatCatalogEntry,
} from "./sat.types";

// ── Provider singleton ─────────────────────────────────────────────────────
// Hoy hay una sola implementación. Si en el futuro se agrega otro provider,
// la elección se hará aquí (config por org, env var, etc.) — sin failover.

let providerInstance: SatProvider | null = null;

function getProvider(): SatProvider {
	if (!providerInstance) {
		providerInstance = new FacturoPortiProvider();
	}
	return providerInstance;
}

/** Permite inyectar un mock en tests. */
export function setSatProvider(provider: SatProvider | null): void {
	providerInstance = provider;
}

// ── Operaciones expuestas ──────────────────────────────────────────────────

export async function getPostalCodeData(
	cp: string,
): Promise<PostalCodeResult[]> {
	const data = await getProvider().getPostalCode(cp);
	if (data.length === 0) {
		throw new NotFoundError("Código postal no encontrado");
	}
	return data;
}

export async function validateRfc(
	input: RfcValidationInput,
): Promise<RfcValidationResult> {
	return getProvider().validateRfc(input);
}

export async function getSatCatalog(
	catalogKey: string,
): Promise<SatCatalogEntry[]> {
	return getProvider().getCatalog(catalogKey);
}

// ── Helpers de mapeo ───────────────────────────────────────────────────────

export function mapPostalCodeToAddress(
	result: PostalCodeResult,
): MappedAddress {
	return {
		suburb: {code: result.claveColonia, name: result.colonia},
		location: {code: result.claveLocalidad, name: result.localidad},
		town: {code: result.claveMunicipio, name: result.municipio},
		city: {code: result.claveLocalidad, name: result.localidad},
		state: {code: result.claveEstado, name: result.estado},
		country: {code: "MEX", name: "México"},
		cp: result.codigoPostal,
	};
}

export function getUsaAddressDefaults(
	state: string,
	stateCode: string,
	cp: string,
	reference?: string,
): MappedAddress {
	return {
		suburb: {code: "0", name: "N/A"},
		location: {code: "0", name: "Localidad USA"},
		town: {code: "0", name: "Municipio USA"},
		city: {code: "0", name: "Localidad USA"},
		state: {code: stateCode, name: state},
		country: {code: "USA", name: "Estados Unidos"},
		cp,
		reference,
	};
}
