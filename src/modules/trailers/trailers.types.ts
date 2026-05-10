import type {ObjectId} from "mongodb";

import type {TrailerDocumentEmbedded} from "./documents/trailer-documents.types";

// ── Enums de dominio ──────────────────────────────────────────────────────

export type TrailerStatus =
	| "available"
	| "in_maintenance"
	| "out_of_service"
	| "in_transit"
	| "decommissioned"
	| "returned_to_partner";

export type OwnershipType =
	| "owned"
	| "leased_fixed_term"
	| "leased_open_ended"
	| "commodatum"
	| "exchange";

export type SuspensionType = "air" | "mechanical_leaf" | "rigid" | "hydraulic";
export type BrakeFrictionType = "drum" | "disc";
export type BrakeActuationType = "air" | "hydraulic" | "inertia";
export type SlackAdjusterType = "manual" | "automatic";
export type AxleConfiguration = "single" | "tandem" | "tridem" | "quad";
export type KingpinDiameter = "2" | "3.5";
export type VoltageSystem = "12V" | "24V";

export type WallMaterial =
	| "post_and_panel_aluminum"
	| "composite_plate"
	| "plywood_frp"
	| "smooth_aluminum"
	| "steel"
	| "other";

export type FloorMaterial =
	| "laminated_hardwood"
	| "smooth_aluminum"
	| "corrugated_aluminum"
	| "steel"
	| "frp_plywood"
	| "other";

export type RearDoorType =
	| "roll_up"
	| "swing_double"
	| "swing_single"
	| "no_door";

export type NhtsaDecodeStatus = "success" | "partial" | "failed" | "not_attempted";

export type RentCurrency = "MXN" | "USD";
export type RentFrequency = "weekly" | "monthly" | "one_time";

// ── Sub-objetos ────────────────────────────────────────────────────────────

export interface TrailerPlates {
	mx: string | null;
	us: string | null;
	usState: string | null;
}

export interface TrailerContractDocument {
	contractNumber: string | null;
	startDate: Date;
	endDate: Date | null;
	terminationNotice: number | null;
	rentAmount: number | null;
	rentCurrency: RentCurrency | null;
	rentFrequency: RentFrequency | null;
	exchangeReference: string | null;
	expectedReturnDate: Date | null;
	contractDocumentUrl: string | null;
	notes: string | null;
}

export interface TrailerOwnershipDocument {
	type: OwnershipType;
	internalTaxIdId: ObjectId | null;
	businessPartnerId: ObjectId | null;
	contract: TrailerContractDocument | null;
}

// ── Foto del remolque (un slot por posición) ─────────────────────────────

export type TrailerPhotoPosition =
	| "leftSide"
	| "rightSide"
	| "rear"
	| "couplingFront";

export const TRAILER_PHOTO_POSITIONS: readonly TrailerPhotoPosition[] = [
	"leftSide",
	"rightSide",
	"rear",
	"couplingFront",
] as const;

export interface TrailerPhotoDocument {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: ObjectId;
}

export interface TrailerPhotosDocument {
	leftSide: TrailerPhotoDocument | null;
	rightSide: TrailerPhotoDocument | null;
	rear: TrailerPhotoDocument | null;
	couplingFront: TrailerPhotoDocument | null;
}

export interface TrailerPhotoView {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: string;
}

export interface TrailerPhotos {
	leftSide: TrailerPhotoView | null;
	rightSide: TrailerPhotoView | null;
	rear: TrailerPhotoView | null;
	couplingFront: TrailerPhotoView | null;
}

// ── Documento Mongo ────────────────────────────────────────────────────────

export interface TrailerDocument {
	_id: ObjectId;
	orgId: ObjectId;

	// ── BLOQUE A: Identidad fiscal y operativa ─────────────────────
	vin: string;
	plates: TrailerPlates;
	ctrSubtype: string;
	economicNumber: string | null;
	status: TrailerStatus;

	// ── BLOQUE B: Identidad del fabricante ──────────────────────────
	make: string;
	makeCode: string | null;
	model: string | null;
	modelYear: number;
	manufacturer: string | null;

	nhtsaDecodedAt: Date | null;
	nhtsaDecodeStatus: NhtsaDecodeStatus | null;
	nhtsaRawData: Record<string, unknown> | null;

	// ── BLOQUE C: Especificaciones técnicas (Nivel 1 obligatorio) ─
	pbvdKg: number;
	taraKg: number;
	lengthMeters: number;
	widthMeters: number;
	heightMeters: number;
	axleCount: number;
	axleConfiguration: AxleConfiguration;
	hasLiftAxle: boolean;
	tirePositionCount: number;

	// Nivel 2 — opcionales, lógica condicional según ctrSubtype
	suspensionType: SuspensionType | null;
	suspensionBrand: string | null;

	brakeFrictionType: BrakeFrictionType | null;
	brakeActuationType: BrakeActuationType | null;
	hasABS: boolean | null;
	slackAdjusterType: SlackAdjusterType | null;

	// Solo si ctrSubtype.isSemiTrailer
	kingpinDiameterInches: KingpinDiameter | null;
	hasLandingGear: boolean | null;

	voltageSystem: VoltageSystem | null;
	hasAuxiliaryPowerUnit: boolean | null;

	// Solo si ctrSubtype.hasEnclosedBody
	wallMaterial: WallMaterial | null;
	floorMaterial: FloorMaterial | null;
	rearDoorType: RearDoorType | null;
	hasSideDoor: boolean | null;
	interiorHeightMeters: number | null;

	// ── BLOQUE D: Propiedad y régimen ───────────────────────────────
	ownership: TrailerOwnershipDocument;

	// ── BLOQUE E: Fotos (4 slots fijos: lados, trasero, acoplamiento) ─
	photos: TrailerPhotosDocument;

	// ── BLOQUE F: Documentos del expediente (embebidos) ─────────────
	documents: TrailerDocumentEmbedded[];

	// ── Auditoría / soft delete ─────────────────────────────────────
	createdBy: ObjectId;
	updatedBy: ObjectId;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio (ObjectId → string) ───────────────────────────────────

export interface TrailerOwnerInternalTaxIdSummary {
	id: string;
	rfc: string;
	razonSocial: string;
}

export interface TrailerOwnerBusinessPartnerSummary {
	id: string;
	legalName: string;
	commercialName: string | null;
	rfc: string | null;
	foreignTaxId: string | null;
	taxRegime: "mexican" | "foreign";
}

export interface TrailerOwnership {
	type: OwnershipType;
	internalTaxIdId: string | null;
	businessPartnerId: string | null;
	contract: TrailerContractDocument | null;
	/** Datos hidratados del taxId interno (solo en getTrailer single). */
	internalTaxId?: TrailerOwnerInternalTaxIdSummary | null;
	/** Datos hidratados del business partner (solo en getTrailer single). */
	businessPartner?: TrailerOwnerBusinessPartnerSummary | null;
}

export interface Trailer
	extends Omit<
		TrailerDocument,
		| "_id"
		| "orgId"
		| "createdBy"
		| "updatedBy"
		| "ownership"
		| "documents"
		| "photos"
	> {
	id: string;
	orgId: string;
	createdBy: string;
	updatedBy: string;
	ownership: TrailerOwnership;
	photos: TrailerPhotos;
	// `documents` no se incluye en el dominio Trailer; se accede vía
	// el endpoint dedicado GET /trailers/:trailerId/documents para no
	// inflar payloads del listado.
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface TrailerOwnershipInput {
	type: OwnershipType;
	internalTaxIdId?: string | null;
	businessPartnerId?: string | null;
	contract?: {
		contractNumber?: string | null;
		startDate: string | Date;
		endDate?: string | Date | null;
		terminationNotice?: number | null;
		rentAmount?: number | null;
		rentCurrency?: RentCurrency | null;
		rentFrequency?: RentFrequency | null;
		exchangeReference?: string | null;
		expectedReturnDate?: string | Date | null;
		contractDocumentUrl?: string | null;
		notes?: string | null;
	} | null;
}

export interface CreateTrailerDto {
	vin: string;
	plates: {
		mx?: string | null;
		us?: string | null;
		usState?: string | null;
	};
	ctrSubtype: string;
	economicNumber?: string | null;

	make: string;
	makeCode?: string | null;
	model?: string | null;
	modelYear: number;
	manufacturer?: string | null;

	nhtsaDecodedAt?: string | Date | null;
	nhtsaDecodeStatus?: NhtsaDecodeStatus | null;
	nhtsaRawData?: Record<string, unknown> | null;

	pbvdKg: number;
	taraKg: number;
	lengthMeters: number;
	widthMeters: number;
	heightMeters: number;
	axleCount: number;
	axleConfiguration: AxleConfiguration;
	hasLiftAxle: boolean;
	tirePositionCount: number;

	suspensionType?: SuspensionType | null;
	suspensionBrand?: string | null;
	brakeFrictionType?: BrakeFrictionType | null;
	brakeActuationType?: BrakeActuationType | null;
	hasABS?: boolean | null;
	slackAdjusterType?: SlackAdjusterType | null;

	kingpinDiameterInches?: KingpinDiameter | null;
	hasLandingGear?: boolean | null;

	voltageSystem?: VoltageSystem | null;
	hasAuxiliaryPowerUnit?: boolean | null;

	wallMaterial?: WallMaterial | null;
	floorMaterial?: FloorMaterial | null;
	rearDoorType?: RearDoorType | null;
	hasSideDoor?: boolean | null;
	interiorHeightMeters?: number | null;

	ownership: TrailerOwnershipInput;
}

export interface QuickRegisterTrailerDto {
	vin?: string | null;
	plates: {
		mx?: string | null;
		us?: string | null;
		usState?: string | null;
	};
	ctrSubtype: string;
	economicNumber?: string | null;
	make?: string | null;
	makeCode?: string | null;
	ownership: {
		// type siempre 'exchange' para quick-register; el service lo fuerza
		type: "exchange";
		businessPartnerId: string;
		contract?: {
			startDate?: string | Date;
			expectedReturnDate?: string | Date | null;
			exchangeReference?: string | null;
			notes?: string | null;
		} | null;
	};
}

export type UpdateTrailerDto = Partial<Omit<CreateTrailerDto, "vin" | "ownership">> & {
	ownership?: TrailerOwnershipInput;
};

export interface TrailerQueryFilter {
	status?: TrailerStatus;
	ctrSubtype?: string;
	ownershipType?: OwnershipType;
	search?: string;
	page?: number;
	limit?: number;
	sortField?: string;
	sortDirection?: "asc" | "desc";
}

export interface TransitionStatusDto {
	newStatus: TrailerStatus;
	reason?: string | null;
}
