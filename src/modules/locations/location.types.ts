import type {ObjectId} from "mongodb";

// ── Subdocumentos ──────────────────────────────────────────────────────────

// Shape idéntico a OrganizationAddress (organization.types.ts:23-35).
// Se duplica intencionalmente porque locations es transversal y no debe
// depender del módulo organizations. La unificación queda como tech-debt.
export interface LocationAddress {
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

export type RfcValidationStatus = "valid" | "invalid" | "pending";
export type ValidationSource = "facturoporti" | "manual";

export interface FiscalLocationData {
	razonSocial: string;
	rfc: string | null;          // 'XEXX010101000' si país !== MEX
	taxId: string | null;        // requerido si país !== MEX
	regimenFiscal: {code: string; name: string} | null;
	rfcValidatedAt: Date | null;
	rfcValidatedStatus: RfcValidationStatus | null;
	validationSource: ValidationSource | null;
	validationNotes: string | null;
}

export interface LocationContact {
	name: string | null;
	role: string | null;
	phone: string | null;
	phoneCode: "+52" | "+1" | "+other";
	email: string | null;
	notes: string | null;
}

export interface DaySchedule {
	open: string;    // "08:00"
	close: string;   // "18:00"
	closed: boolean;
}

export interface WeeklySchedule {
	monday: DaySchedule | null;
	tuesday: DaySchedule | null;
	wednesday: DaySchedule | null;
	thursday: DaySchedule | null;
	friday: DaySchedule | null;
	saturday: DaySchedule | null;
	sunday: DaySchedule | null;
}

export interface OperatingHours {
	is24x7: boolean;
	schedule: WeeklySchedule | null;
	holidays: "open" | "closed" | "reduced";
}

export interface AccessHours {
	hasRestrictedAccess: boolean;
	schedule: WeeklySchedule | null;
	notes: string | null;
}

// ── Geocerca ───────────────────────────────────────────────────────────────

export interface GeofenceCircle {
	type: "circle";
	center: {lat: number; lng: number};
	radiusMeters: number;
}

export interface GeofencePolygon {
	type: "polygon";
	points: Array<{lat: number; lng: number}>;
}

export type Geofence = GeofenceCircle | GeofencePolygon;

// ── GeoJSON Point ──────────────────────────────────────────────────────────

export interface GeoPoint {
	type: "Point";
	coordinates: [number, number]; // [lng, lat]
}

// ── AI-ready (placeholders v1, populated en Fase 3+) ──────────────────────

export interface LocationDenormalizedRefs {
	clientName: string | null;
	createdByName: string | null;
	updatedByName: string | null;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface LocationDocument {
	_id: ObjectId;
	orgId: ObjectId;

	name: string;
	description: string | null;

	location: GeoPoint;
	geofence: Geofence;

	isFiscal: boolean;
	fiscal: FiscalLocationData | null;
	address: LocationAddress | null;
	idOrigenDestino: string | null;

	clientId: ObjectId | null;
	contact: LocationContact | null;
	operatingHours: OperatingHours | null;
	accessHours: AccessHours | null;

	isActive: boolean;
	isSystem: boolean;

	createdBy: ObjectId;
	updatedBy: ObjectId | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;

	// AI-ready (placeholders v1)
	llmSummary: string | null;
	llmSummaryUpdatedAt: Date | null;
	humanReadableId: string | null;
	contentText: string | null;
	contentTextHash: string | null;
	embedding: number[] | null;
	embeddingHash: string | null;
	embeddingModel: string | null;
	embeddingGeneratedAt: Date | null;
	denormalizedRefs: LocationDenormalizedRefs;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Location {
	id: string;
	orgId: string;

	name: string;
	description: string | null;

	location: GeoPoint;
	geofence: Geofence;

	isFiscal: boolean;
	fiscal: FiscalLocationData | null;
	address: LocationAddress | null;
	idOrigenDestino: string | null;

	clientId: string | null;
	contact: LocationContact | null;
	operatingHours: OperatingHours | null;
	accessHours: AccessHours | null;

	isActive: boolean;
	isSystem: boolean;

	createdBy: string;
	updatedBy: string | null;
	createdAt: Date;
	updatedAt: Date;

	llmSummary: string | null;
	humanReadableId: string | null;
	denormalizedRefs: LocationDenormalizedRefs;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateLocationDto {
	name: string;
	description?: string | null;

	location: GeoPoint;
	geofence: Geofence;

	isFiscal: boolean;
	fiscal?: FiscalLocationData | null;
	address?: LocationAddress | null;

	clientId?: string | null;
	contact?: LocationContact | null;
	operatingHours?: OperatingHours | null;
	accessHours?: AccessHours | null;
}

export interface UpdateLocationDto {
	name?: string;
	description?: string | null;

	location?: GeoPoint;
	geofence?: Geofence;

	isFiscal?: boolean;
	fiscal?: FiscalLocationData | null;
	address?: LocationAddress | null;

	clientId?: string | null;
	contact?: LocationContact | null;
	operatingHours?: OperatingHours | null;
	accessHours?: AccessHours | null;

	isActive?: boolean;
}

export interface LocationQueryFilter {
	search?: string;
	country?: string;       // código ISO (e.g., 'MEX', 'USA')
	isFiscal?: boolean;
	isActive?: boolean;
	clientId?: string;
	page?: number;
	limit?: number;
}

export interface NearbyQuery {
	lat: number;
	lng: number;
	radiusMeters: number;
	limit?: number;
}

export interface ValidateFiscalDto {
	rfc: string;
	razonSocial: string;
	cp: string;
}

export interface CheckPointDto {
	lat: number;
	lng: number;
}

export interface CheckPointResult {
	insideGeofence: boolean;
}
