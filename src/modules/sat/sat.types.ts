// ── Código Postal ──────────────────────────────────────────────────────────

export interface PostalCodeResult {
	claveColonia: string;
	colonia: string;
	claveLocalidad: string;
	localidad: string;
	claveMunicipio: string;
	municipio: string;
	claveEstado: string;
	estado: string;
	codigoPostal: string;
}

// ── Validación RFC ─────────────────────────────────────────────────────────

export interface RfcValidationInput {
	rfc: string;
	nombreRazonSocial: string;
	regimenFiscal: string | null;
	codigoPostal: string;
}

export interface RfcValidationResult {
	esValido: boolean;
	estatus: string;
	usosCFDIPermitidos: string | null;
}

// ── Catálogos SAT ──────────────────────────────────────────────────────────

export interface SatCatalogEntry {
	code: string;
	description: string;
}

// ── Mapeo address ──────────────────────────────────────────────────────────
// Convierte respuesta del proveedor SAT al formato de address del sistema

export interface MappedAddress {
	suburb: {code: string; name: string};
	location: {code: string; name: string};
	town: {code: string; name: string};
	city: {code: string; name: string};
	state: {code: string; name: string};
	country: {code: string; name: string};
	cp: string;
	reference?: string;
}
