import type {ObjectId} from "mongodb";

// ── Address ────────────────────────────────────────────────────────────────
// Mismo shape que el resto del sistema (organization, location).

export interface BusinessPartnerAddress {
	street: string;
	numExt: string;
	numInt: string;
	city: {name: string; code: string};
	state: {name: string; code: string};
	town: {name: string; code: string};
	suburb: {name: string; code: string};
	location: {name: string; code: string};
	country: {name: string; code: string};
	cp: string;
	reference?: string;
}

// ── Roles ──────────────────────────────────────────────────────────────────
// Roles dentro del DOMINIO de business partner — NO confundir con permisos
// RBAC del sistema. Estos describen qué tipo de relación comercial existe
// con el partner: arrendador, partner de intercambio, etc.

export type BusinessPartnerRole =
	| "trailer_exchange_partner" // partner que presta remolques en intercambio
	| "lessor"; // arrendador de equipo

export const BUSINESS_PARTNER_ROLES: BusinessPartnerRole[] = [
	"trailer_exchange_partner",
	"lessor",
];

// ── Régimen tributario ─────────────────────────────────────────────────────

export type TaxRegime = "mexican" | "foreign";
export type RfcValidationStatus = "valid" | "invalid" | null;

// ── Contactos ──────────────────────────────────────────────────────────────

export type ContactRole = "general" | "operations" | "billing" | "other";

export interface BusinessPartnerContact {
	name: string;
	phoneCode: string; // '+52', '+1', etc.
	phone: string;
	email: string | null;
	role: ContactRole;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface BusinessPartnerDocument {
	_id: ObjectId;
	orgId: ObjectId;

	legalName: string; // razón social
	commercialName: string | null; // nombre comercial / como se le conoce

	// Régimen tributario
	taxRegime: TaxRegime;
	rfc: string | null; // si es mexicano
	foreignTaxId: string | null; // si es extranjero (EIN, etc.)
	foreignTaxCountry: string | null; // ISO 3166-1 (US, CA, etc.)
	rfcValidatedAt: Date | null;
	rfcValidatedStatus: RfcValidationStatus;

	address: BusinessPartnerAddress | null;
	contacts: BusinessPartnerContact[];

	roles: BusinessPartnerRole[];

	isActive: boolean;
	notes: string | null;

	createdBy: ObjectId;
	updatedBy: ObjectId | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface BusinessPartner {
	id: string;
	orgId: string;

	legalName: string;
	commercialName: string | null;

	taxRegime: TaxRegime;
	rfc: string | null;
	foreignTaxId: string | null;
	foreignTaxCountry: string | null;
	rfcValidatedAt: Date | null;
	rfcValidatedStatus: RfcValidationStatus;

	address: BusinessPartnerAddress | null;
	contacts: BusinessPartnerContact[];
	roles: BusinessPartnerRole[];

	isActive: boolean;
	notes: string | null;

	createdBy: string;
	updatedBy: string | null;
	createdAt: Date;
	updatedAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateBusinessPartnerDto {
	legalName: string;
	commercialName?: string | null;
	taxRegime: TaxRegime;
	rfc?: string | null;
	foreignTaxId?: string | null;
	foreignTaxCountry?: string | null;
	address?: BusinessPartnerAddress | null;
	contacts: BusinessPartnerContact[];
	roles?: BusinessPartnerRole[];
	notes?: string | null;
}

export interface UpdateBusinessPartnerDto {
	legalName?: string;
	commercialName?: string | null;
	taxRegime?: TaxRegime;
	rfc?: string | null;
	foreignTaxId?: string | null;
	foreignTaxCountry?: string | null;
	address?: BusinessPartnerAddress | null;
	contacts?: BusinessPartnerContact[];
	roles?: BusinessPartnerRole[];
	isActive?: boolean;
	notes?: string | null;
}

export interface BusinessPartnerQueryFilter {
	role?: BusinessPartnerRole;
	isActive?: boolean;
	taxRegime?: TaxRegime;
	search?: string;
	page?: number;
	limit?: number;
}

export interface ValidateBusinessPartnerRfcResult {
	rfcValidatedAt: Date;
	rfcValidatedStatus: Exclude<RfcValidationStatus, null>;
	estatus: string;
	usosCFDIPermitidos: string | null;
}
