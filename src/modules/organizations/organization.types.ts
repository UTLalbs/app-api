import type {ObjectId} from "mongodb";

// ── Subdocumentos ──────────────────────────────────────────────────────────

export type WeightUnit = "kg" | "lb";
export type DimensionUnit = "m" | "ft";
export type VolumeUnit = "m3" | "ft3";
export type TemperatureUnit = "C" | "F";

export interface OrganizationSettings {
	timezone: string;
	distanceUnit: "km" | "mi";
	/**
	 * Unidades de captura/display. El backend siempre persiste en métrico
	 * (kg, m, m³, °C). El frontend convierte para mostrar/recibir según
	 * estos settings.
	 */
	weightUnit: WeightUnit;
	dimensionUnit: DimensionUnit;
	volumeUnit: VolumeUnit;
	temperatureUnit: TemperatureUnit;
	currency: string[];
	gpsUpdateInterval: number;
	maxUsers: number;
	allowedEmailDomains: string[];
	features: {
		operations: boolean;
		fuel: boolean;
		maintenance: boolean;
		administration: boolean;
		humanResources: boolean;
		payroll: boolean;
		catalogs: boolean;
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

// ── Tax IDs (multi-RFC por organización) ──────────────────────────────────
// Cada tenant puede tener varias razones sociales. Cada una se modela como
// un subdoc dentro de fiscalData.taxIds[]. El `_id` (ObjectId) es la FK que
// usan otros recursos (ej. trailers.ownership.internalTaxIdId).

export type RfcValidationStatus = "valid" | "invalid" | null;

/** Subdoc tal como vive en MongoDB. */
export interface OrganizationTaxIdDocument {
	_id: ObjectId;
	rfc: string;
	razonSocial: string;
	regimenFiscal: {code: string; name: string} | null;
	address: OrganizationAddress | null;
	isDefault: boolean;
	isActive: boolean;
	rfcValidatedAt: Date | null;
	rfcValidatedStatus: RfcValidationStatus;
	createdAt: Date;
	updatedAt: Date;
}

/** Tipo de dominio (ObjectId → string). */
export interface OrganizationTaxId
	extends Omit<OrganizationTaxIdDocument, "_id"> {
	id: string;
}

export interface OrganizationFiscalDataDocument {
	taxIds: OrganizationTaxIdDocument[];
}

export interface OrganizationFiscalData {
	taxIds: OrganizationTaxId[];
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
	fiscalData: OrganizationFiscalDataDocument | null;
	contacts: OrgContact[];
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
	contacts: OrgContact[];
	createdAt: Date;
	updatedAt: Date;
}

// ── Enums ──────────────────────────────────────────────────────────────────

export type OrganizationStatus = "active" | "trial" | "suspended" | "cancelled";

// ── DTOs ──────────────────────────────────────────────────────────────────

/** Input para crear el primer taxId al registrar la organización. */
export interface InitialTaxIdInput {
	rfc: string;
	razonSocial: string;
	regimenFiscal: {code: string; name: string};
	address?: OrganizationAddress | null;
}

export interface CreateOrganizationDto {
	name: string;
	slug?: string;
	settings?: Partial<OrganizationSettings>;
	/**
	 * Primer taxId del tenant. Si se provee, se inserta como `taxIds[0]`
	 * con `isDefault: true` y `isActive: true`. Posteriores RFCs se agregan
	 * vía POST /:id/tax-ids.
	 */
	initialTaxId?: InitialTaxIdInput | null;
	contacts?: OrgContact[] | null;
}

/**
 * `fiscalData` ya no se modifica vía PATCH /:id — se usan los endpoints
 * anidados `/:id/tax-ids/*` para gestionar RFCs.
 */
export interface UpdateOrganizationDto {
	name?: string;
	status?: OrganizationStatus;
	settings?: Partial<OrganizationSettings>;
	contacts?: OrgContact[] | null;
}
