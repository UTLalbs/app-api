import type {ObjectId} from "mongodb";

// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface OrganizationSettings {
	timezone: string;
	distanceUnit: "km" | "mi";
	currency: string[];
	gpsUpdateInterval: number;
	maxUsers: number;
	allowedEmailDomains: string[];
	features: {
		operations: boolean;
		fuel: boolean;
		maintenance: boolean;
		administration: boolean;
		payroll: boolean;
	};
}

export interface OrganizationAddress {
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

export interface OrganizationFiscalData {
	rfc: string;
	razonSocial: string;
	regimenFiscal: {
		code: string;
		name: string;
	};
	address: OrganizationAddress | null;
}

export interface OrgContact {
	name: string;
	title: string;
	phoneCode: "+52" | "+1";
	phone: string;
	email: string;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface OrganizationDocument {
	_id: ObjectId;
	name: string;
	slug: string;
	status: OrganizationStatus;
	settings: OrganizationSettings;
  fiscalData: OrganizationFiscalData | null;
  contact: OrgContact | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Organization {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	settings: OrganizationSettings;
  fiscalData: OrganizationFiscalData | null;
  contact: OrgContact | null;
	createdAt: Date;
	updatedAt: Date;
}

// ── Enums ──────────────────────────────────────────────────────────────────

export type OrganizationStatus = "active" | "suspended" | "cancelled";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateOrganizationDto {
	name: string;
	slug?: string;
	settings?: Partial<OrganizationSettings>;
	fiscalData?: OrganizationFiscalData | null;
	contact?: OrgContact | null;
}

export interface UpdateOrganizationDto {
	name?: string;
	status?: OrganizationStatus;
	settings?: Partial<OrganizationSettings>;
	fiscalData?: OrganizationFiscalData | null;
	contact?: OrgContact | null;
}
