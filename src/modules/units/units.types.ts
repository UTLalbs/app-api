import type {ObjectId} from "mongodb";

import type {UnitDocumentEmbedded} from "./documents/unit-documents.types";

// ── Enums de dominio ──────────────────────────────────────────────────────

export type UnitStatus =
	| "available"
	| "assigned"
	| "in_route"
	| "in_maintenance"
	| "out_of_service"
	| "decommissioned"
	| "returned_to_partner";

export type UnitOwnershipType =
	| "owned"
	| "leased_fixed_term"
	| "leased_open_ended"
	| "commodatum"
	| "exchange";

export type FuelType =
	| "diesel"
	| "gasoline"
	| "cng"
	| "lng"
	| "lpg"
	| "non_fossil"
	| "electric"
	| "hybrid"
	| "hydrogen";

export type TransmissionType = "manual" | "automated_manual" | "automatic";

export type DriveAxleConfig = "4x2" | "6x2" | "6x4" | "8x4" | "8x6" | "4x4";

export type CabType = "day_cab" | "sleeper_mid" | "sleeper_high";

export type SuspensionType = "air" | "mechanical_leaf" | "rigid" | "hydraulic";
export type BrakeFrictionType = "drum" | "disc";
export type BrakeActuationType = "air" | "hydraulic" | "inertia";

export type TankPosition = "primary" | "secondary" | "tertiary";
export type TankSide = "left" | "right" | "center";

export type UnitPhotoPosition = "leftSide" | "rightSide" | "front" | "rear";

export const UNIT_PHOTO_POSITIONS: readonly UnitPhotoPosition[] = [
	"leftSide",
	"rightSide",
	"front",
	"rear",
] as const;

export type NhtsaDecodeStatus = "success" | "partial" | "failed" | "not_attempted";

export type RentCurrency = "MXN" | "USD";
export type RentFrequency = "weekly" | "monthly" | "one_time";

// ── Sub-objetos ────────────────────────────────────────────────────────────

export interface UnitPlates {
	mx: string | null;
	us: string | null;
	usState: string | null;
}

export interface FuelTank {
	position: TankPosition;
	capacityL: number;
	side: TankSide | null;
	notes: string | null;
}

export interface UnitContractDocument {
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

export interface UnitOwnershipDocument {
	type: UnitOwnershipType;
	internalTaxIdId: ObjectId | null;
	businessPartnerId: ObjectId | null;
	contract: UnitContractDocument | null;
}

// ── Foto de la unidad (un slot por posición) ─────────────────────────────

export interface UnitPhotoDocument {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: ObjectId;
}

export interface UnitPhotosDocument {
	leftSide: UnitPhotoDocument | null;
	rightSide: UnitPhotoDocument | null;
	front: UnitPhotoDocument | null;
	rear: UnitPhotoDocument | null;
}

export interface UnitPhotoView {
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: Date;
	uploadedBy: string;
}

export interface UnitPhotos {
	leftSide: UnitPhotoView | null;
	rightSide: UnitPhotoView | null;
	front: UnitPhotoView | null;
	rear: UnitPhotoView | null;
}

// ── Documento Mongo ────────────────────────────────────────────────────────

export interface UnitDocument {
	_id: ObjectId;
	orgId: ObjectId;

	// ── BLOQUE A: Identidad fiscal y operativa ────────────────────────
	vin: string;
	plates: UnitPlates;
	satConfigCode: string;          // c_ConfigAutotransporte (ej. T3S2)
	sctPermitType: string | null;   // c_TipoPermiso (TPAFxx)
	sctPermitNumber: string | null; // Folio/número del permiso (ej. 0919UTA1808201602100100114)
	economicNumber: string | null;
	status: UnitStatus;

	// ── BLOQUE B: Identidad del fabricante ──────────────────────────
	make: string;
	makeCode: string | null;
	model: string | null;
	modelYear: number;
	manufacturer: string | null;
	color: string | null;
	engineNumber: string | null;

	nhtsaDecodedAt: Date | null;
	nhtsaDecodeStatus: NhtsaDecodeStatus | null;
	nhtsaRawData: Record<string, unknown> | null;

	// ── BLOQUE C: Motor y combustible ─────────────────────────────────
	fuelType: FuelType;
	fuelTypeCodeSAT: string | null; // c_TipoCombustible
	engineMake: string | null;
	engineModel: string | null;
	engineDisplacementL: number | null;
	enginePowerHp: number | null;
	engineTorqueLbFt: number | null;
	fuelTanks: FuelTank[];
	defTankCapacityL: number | null;
	nominalConsumptionLPer100Km: number | null;

	// ── BLOQUE D: Transmisión y drivetrain ────────────────────────────
	transmissionType: TransmissionType;
	transmissionMake: string | null;
	transmissionModel: string | null;
	driveAxleConfig: DriveAxleConfig;
	rearAxleRatio: number | null;

	// ── BLOQUE E: Especificaciones físicas ────────────────────────────
	pbvKg: number;
	taraKg: number;
	gvwrLb: number | null;
	lengthMeters: number | null;
	widthMeters: number | null;
	heightMeters: number | null;
	axleCount: number;
	hasABS: boolean;
	hasAuxiliaryPowerUnit: boolean;
	cabType: CabType | null;

	// ── BLOQUE F: Frenos / suspensión ─────────────────────────────────
	brakeFrictionType: BrakeFrictionType | null;
	brakeActuationType: BrakeActuationType | null;
	suspensionType: SuspensionType | null;
	suspensionBrand: string | null;

	// ── BLOQUE G: Propiedad ───────────────────────────────────────────
	ownership: UnitOwnershipDocument;

	// ── BLOQUE H: Operador asignado (source of truth) ─────────────────
	currentOperatorId: ObjectId | null;
	currentOperatorAssignedAt: Date | null;

	// ── BLOQUE I: Póliza activa (cache; source en futuro insurance-policies)
	activePolicyId: ObjectId | null;

	// ── BLOQUE J: Fotos (4 slots fijos: lados, frontal, trasero) ────────
	photos: UnitPhotosDocument;

	// ── BLOQUE K: Documentos embebidos ────────────────────────────────
	documents: UnitDocumentEmbedded[];

	// ── Auditoría / soft delete ───────────────────────────────────────
	createdBy: ObjectId;
	updatedBy: ObjectId;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

// ── Tipo de dominio (ObjectId → string) ───────────────────────────────────

export interface UnitOwnerInternalTaxIdSummary {
	id: string;
	rfc: string;
	razonSocial: string;
}

export interface UnitOwnerBusinessPartnerSummary {
	id: string;
	legalName: string;
	commercialName: string | null;
	rfc: string | null;
	foreignTaxId: string | null;
	taxRegime: "mexican" | "foreign";
}

export interface UnitOwnership {
	type: UnitOwnershipType;
	internalTaxIdId: string | null;
	businessPartnerId: string | null;
	contract: UnitContractDocument | null;
	internalTaxId?: UnitOwnerInternalTaxIdSummary | null;
	businessPartner?: UnitOwnerBusinessPartnerSummary | null;
}

export interface UnitOperatorSummary {
	id: string;
	fullName: string;
	employeeNumber: string | null;
	driverStatus: string | null;
}

export interface Unit
	extends Omit<
		UnitDocument,
		| "_id"
		| "orgId"
		| "createdBy"
		| "updatedBy"
		| "ownership"
		| "documents"
		| "currentOperatorId"
		| "activePolicyId"
		| "photos"
	> {
	id: string;
	orgId: string;
	createdBy: string;
	updatedBy: string;
	ownership: UnitOwnership;
	currentOperatorId: string | null;
	activePolicyId: string | null;
	photos: UnitPhotos;
	/** Datos hidratados del operador asignado (solo en getUnit single y enrich). */
	currentOperator?: UnitOperatorSummary | null;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface UnitOwnershipInput {
	type: UnitOwnershipType;
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

export interface FuelTankInput {
	position: TankPosition;
	capacityL: number;
	side?: TankSide | null;
	notes?: string | null;
}

export interface CreateUnitDto {
	vin: string;
	plates: {
		mx?: string | null;
		us?: string | null;
		usState?: string | null;
	};
	satConfigCode: string;
	sctPermitType?: string | null;
	sctPermitNumber?: string | null;
	economicNumber?: string | null;

	make: string;
	makeCode?: string | null;
	model?: string | null;
	modelYear: number;
	manufacturer?: string | null;
	color?: string | null;
	engineNumber?: string | null;

	nhtsaDecodedAt?: string | Date | null;
	nhtsaDecodeStatus?: NhtsaDecodeStatus | null;
	nhtsaRawData?: Record<string, unknown> | null;

	fuelType: FuelType;
	fuelTypeCodeSAT?: string | null;
	engineMake?: string | null;
	engineModel?: string | null;
	engineDisplacementL?: number | null;
	enginePowerHp?: number | null;
	engineTorqueLbFt?: number | null;
	fuelTanks?: FuelTankInput[] | null;
	defTankCapacityL?: number | null;
	nominalConsumptionLPer100Km?: number | null;

	transmissionType: TransmissionType;
	transmissionMake?: string | null;
	transmissionModel?: string | null;
	driveAxleConfig: DriveAxleConfig;
	rearAxleRatio?: number | null;

	pbvKg: number;
	taraKg: number;
	gvwrLb?: number | null;
	lengthMeters?: number | null;
	widthMeters?: number | null;
	heightMeters?: number | null;
	axleCount: number;
	hasABS: boolean;
	hasAuxiliaryPowerUnit: boolean;
	cabType?: CabType | null;

	brakeFrictionType?: BrakeFrictionType | null;
	brakeActuationType?: BrakeActuationType | null;
	suspensionType?: SuspensionType | null;
	suspensionBrand?: string | null;

	ownership: UnitOwnershipInput;
}

export interface QuickRegisterUnitDto {
	vin?: string | null;
	plates: {
		mx?: string | null;
		us?: string | null;
		usState?: string | null;
	};
	satConfigCode: string;
	economicNumber?: string | null;
	make?: string | null;
	makeCode?: string | null;
	fuelType?: FuelType | null;
	ownership: {
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

export type UpdateUnitDto = Partial<Omit<CreateUnitDto, "vin" | "ownership">> & {
	ownership?: UnitOwnershipInput;
};

export interface UnitQueryFilter {
	status?: UnitStatus;
	satConfigCode?: string;
	ownershipType?: UnitOwnershipType;
	fuelType?: FuelType;
	hasOperator?: boolean;
	search?: string;
	page?: number;
	limit?: number;
	sortField?: string;
	sortDirection?: "asc" | "desc";
}

export interface TransitionUnitStatusDto {
	newStatus: UnitStatus;
	reason?: string | null;
}

export interface AssignOperatorDto {
	operatorEmployeeId: string;
	notes?: string | null;
}
