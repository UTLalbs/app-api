import type {OrganizationAddress, RfcValidationStatus} from "./organization.types";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateTaxIdDto {
	rfc: string;
	razonSocial: string;
	regimenFiscal: {code: string; name: string};
	address?: OrganizationAddress | null;
	isDefault?: boolean;
}

export interface UpdateTaxIdDto {
	rfc?: string;
	razonSocial?: string;
	regimenFiscal?: {code: string; name: string};
	address?: OrganizationAddress | null;
}

export interface ValidateTaxIdRfcResult {
	rfcValidatedAt: Date;
	rfcValidatedStatus: Exclude<RfcValidationStatus, null>;
	estatus: string;
	usosCFDIPermitidos: string | null;
}
