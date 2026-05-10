import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {decodeVinValues} from "../../infrastructure/http/nhtsaClient";
import {
	deleteFile,
	extractKeyFromUrl,
	generateS3Key,
	uploadFile,
	validateFile,
} from "../../infrastructure/storage/s3.service";
import {NotFoundError, ValidationError} from "../../shared/errors/AppError";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {findBusinessPartnerById} from "../business-partners/business-partners.repository";
import {
	findEmployeeById,
	updateEmployeeCurrentUnit,
} from "../hr/employees/employee.repository";
import {findTaxId} from "../organizations/taxId.repository";

import {
	getUnitConfig,
	isLightVehicleConfig,
	isTractorConfig,
	isUnitConfigCode,
} from "./constants/unitConfigCatalog.constants";
import {
	isUnitFuelSatCode,
	isUnitSctPermitCode,
} from "./constants/unitFuelTypes.constants";
import {mapNhtsaUnitResponse, type DecodeUnitVinResponse} from "./helpers/nhtsa-mapper";
import {normalizePlate} from "./helpers/plate-normalizer";
import {validateVin} from "./helpers/vin-validator";
import {
	findUnitByCurrentOperator,
	findUnitByEconomicNumber,
	findUnitById,
	findUnitByPlate,
	findUnitByVin,
	findUnits,
	insertUnit,
	softDeleteUnit,
	updateUnitFields,
} from "./units.repository";
import type {
	CreateUnitDto,
	FuelTank,
	QuickRegisterUnitDto,
	Unit,
	UnitContractDocument,
	UnitDocument,
	UnitOperatorSummary,
	UnitOwnershipDocument,
	UnitOwnershipInput,
	UnitPhotoPosition,
	UnitQueryFilter,
	UnitStatus,
	UpdateUnitDto,
} from "./units.types";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listUnits(
	orgId: string,
	filter: UnitQueryFilter,
): Promise<{units: Unit[]; total: number}> {
	const result = await findUnits(orgId, filter);
	const enriched = await enrichOwnerships(orgId, result.units);
	const withOperator = await enrichOperators(orgId, enriched);
	return {units: withOperator, total: result.total};
}

export async function getUnit(orgId: string, id: string): Promise<Unit> {
	const unit = await findUnitById(orgId, id);
	if (!unit) throw new NotFoundError("Unit");
	const [enriched] = await enrichOwnerships(orgId, [unit]);
	const [withOperator] = await enrichOperators(orgId, [enriched ?? unit]);
	return withOperator ?? unit;
}

// ── Check de duplicados (pre-validación del wizard) ──────────────────────

export interface CheckUnitDuplicatesInput {
	vin?: string | null;
	plates_mx?: string | null;
	plates_us?: string | null;
	economicNumber?: string | null;
	/** Si se pasa, se ignoran coincidencias con esta unidad (modo edit). */
	excludeUnitId?: string | null;
}

export interface UnitDuplicateMatch {
	field: "vin" | "plates_mx" | "plates_us" | "economicNumber";
	value: string;
	unit: {
		id: string;
		vin: string;
		economicNumber: string | null;
		plates: {mx: string | null; us: string | null};
		status: Unit["status"];
	};
}

/**
 * Busca duplicados de VIN, placas y número económico en la org del usuario.
 * Excluye soft-deleted (al eliminar se libera el VIN/placa/económico).
 */
export async function checkUnitDuplicates(
	orgId: string,
	input: CheckUnitDuplicatesInput,
): Promise<UnitDuplicateMatch[]> {
	const matches: UnitDuplicateMatch[] = [];

	const tryAdd = (
		field: UnitDuplicateMatch["field"],
		value: string,
		unit: Unit | null,
	): void => {
		if (!unit) return;
		if (input.excludeUnitId && unit.id === input.excludeUnitId) return;
		matches.push({
			field,
			value,
			unit: {
				id: unit.id,
				vin: unit.vin,
				economicNumber: unit.economicNumber,
				plates: {mx: unit.plates.mx, us: unit.plates.us},
				status: unit.status,
			},
		});
	};

	const lookups: Promise<void>[] = [];

	if (input.vin) {
		const vin = input.vin.toUpperCase().trim();
		if (vin.length === 17) {
			lookups.push(findUnitByVin(orgId, vin).then((u) => tryAdd("vin", vin, u)));
		}
	}
	if (input.plates_mx) {
		const plate = input.plates_mx.toUpperCase().trim();
		lookups.push(
			findUnitByPlate(orgId, "mx", plate).then((u) => tryAdd("plates_mx", plate, u)),
		);
	}
	if (input.plates_us) {
		const plate = input.plates_us.toUpperCase().trim();
		lookups.push(
			findUnitByPlate(orgId, "us", plate).then((u) => tryAdd("plates_us", plate, u)),
		);
	}
	if (input.economicNumber) {
		const eco = input.economicNumber.trim();
		lookups.push(
			findUnitByEconomicNumber(orgId, eco).then((u) =>
				tryAdd("economicNumber", eco, u),
			),
		);
	}

	await Promise.all(lookups);

	return matches;
}

// ── Crear (alta completa) ──────────────────────────────────────────────────

export async function createUnit(
	orgId: string,
	actorId: string,
	dto: CreateUnitDto,
	context: AuditContext,
): Promise<Unit> {
	assertSatConfigCode(dto.satConfigCode);
	if (dto.sctPermitType) assertSctPermitType(dto.sctPermitType);
	if (dto.fuelTypeCodeSAT) assertFuelTypeSatCode(dto.fuelTypeCodeSAT);

	enforceConditionalFields({
		satConfigCode: dto.satConfigCode,
		fuelType: dto.fuelType,
		modelYear: dto.modelYear,
		fuelTanks: dto.fuelTanks ?? [],
		defTankCapacityL: dto.defTankCapacityL ?? null,
		engineDisplacementL: dto.engineDisplacementL ?? null,
		cabType: dto.cabType ?? null,
		engineMake: dto.engineMake ?? null,
		enginePowerHp: dto.enginePowerHp ?? null,
		nominalConsumptionLPer100Km: dto.nominalConsumptionLPer100Km ?? null,
	});

	await assertOwnershipCoherence(orgId, dto.ownership);

	const now = new Date();
	const ownership = await buildOwnershipDocument(dto.ownership, now);

	const doc: Omit<UnitDocument, "_id"> = {
		orgId: new ObjectId(orgId),

		vin: dto.vin.toUpperCase().trim(),
		plates: {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		},
		satConfigCode: dto.satConfigCode.toUpperCase(),
		sctPermitType: dto.sctPermitType?.toUpperCase().trim() || null,
		sctPermitNumber: dto.sctPermitNumber?.trim() || null,
		economicNumber: dto.economicNumber?.trim() || null,
		status: "available",

		make: dto.make.trim(),
		makeCode: dto.makeCode ?? null,
		model: dto.model?.trim() || null,
		modelYear: dto.modelYear,
		manufacturer: dto.manufacturer?.trim() || null,
		color: dto.color?.trim() || null,
		engineNumber: dto.engineNumber?.trim() || null,

		nhtsaDecodedAt: dto.nhtsaDecodedAt ? new Date(dto.nhtsaDecodedAt) : null,
		nhtsaDecodeStatus: dto.nhtsaDecodeStatus ?? null,
		nhtsaRawData: dto.nhtsaRawData ?? null,

		fuelType: dto.fuelType,
		fuelTypeCodeSAT: dto.fuelTypeCodeSAT ?? null,
		engineMake: dto.engineMake?.trim() || null,
		engineModel: dto.engineModel?.trim() || null,
		engineDisplacementL: dto.engineDisplacementL ?? null,
		enginePowerHp: dto.enginePowerHp ?? null,
		engineTorqueLbFt: dto.engineTorqueLbFt ?? null,
		fuelTanks: normalizeFuelTanks(dto.fuelTanks ?? []),
		defTankCapacityL: dto.defTankCapacityL ?? null,
		nominalConsumptionLPer100Km: dto.nominalConsumptionLPer100Km ?? null,

		transmissionType: dto.transmissionType,
		transmissionMake: dto.transmissionMake?.trim() || null,
		transmissionModel: dto.transmissionModel?.trim() || null,
		driveAxleConfig: dto.driveAxleConfig,
		rearAxleRatio: dto.rearAxleRatio ?? null,

		pbvKg: dto.pbvKg,
		taraKg: dto.taraKg,
		gvwrLb: dto.gvwrLb ?? null,
		lengthMeters: dto.lengthMeters ?? null,
		widthMeters: dto.widthMeters ?? null,
		heightMeters: dto.heightMeters ?? null,
		axleCount: dto.axleCount,
		hasABS: dto.hasABS,
		hasAuxiliaryPowerUnit: dto.hasAuxiliaryPowerUnit,
		cabType: dto.cabType ?? null,

		brakeFrictionType: dto.brakeFrictionType ?? null,
		brakeActuationType: dto.brakeActuationType ?? null,
		suspensionType: dto.suspensionType ?? null,
		suspensionBrand: dto.suspensionBrand?.trim() || null,

		ownership,

		currentOperatorId: null,
		currentOperatorAssignedAt: null,
		activePolicyId: null,

		photos: {leftSide: null, rightSide: null, front: null, rear: null},
		documents: [],

		createdBy: new ObjectId(actorId),
		updatedBy: new ObjectId(actorId),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertUnit(doc);

	logger.info(
		{orgId, unitId: created.id, vin: created.vin, satConfigCode: created.satConfigCode},
		"Unit created",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_created",
		target: {type: "unit", id: created.id, displayName: created.vin},
		metadata: {
			satConfigCode: created.satConfigCode,
			ownershipType: created.ownership.type,
			fuelType: created.fuelType,
		},
		context,
	});

	return created;
}

// ── Quick register ─────────────────────────────────────────────────────────

export async function quickRegisterUnit(
	orgId: string,
	actorId: string,
	dto: QuickRegisterUnitDto,
	context: AuditContext,
): Promise<Unit> {
	assertSatConfigCode(dto.satConfigCode);

	const ownershipInput: UnitOwnershipInput = {
		type: "exchange",
		businessPartnerId: dto.ownership.businessPartnerId,
		contract: dto.ownership.contract
			? {
					startDate: dto.ownership.contract.startDate ?? new Date(),
					expectedReturnDate: dto.ownership.contract.expectedReturnDate ?? null,
					exchangeReference: dto.ownership.contract.exchangeReference ?? null,
					notes: dto.ownership.contract.notes ?? null,
				}
			: {startDate: new Date()},
	};

	await assertOwnershipCoherence(orgId, ownershipInput);

	const now = new Date();
	const ownership = await buildOwnershipDocument(ownershipInput, now);

	const doc: Omit<UnitDocument, "_id"> = {
		orgId: new ObjectId(orgId),

		vin: (dto.vin ?? generatePlaceholderVin(dto.plates)).toUpperCase().trim(),
		plates: {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		},
		satConfigCode: dto.satConfigCode.toUpperCase(),
		sctPermitType: null,
		sctPermitNumber: null,
		economicNumber: dto.economicNumber?.trim() || null,
		status: "available",

		make: dto.make?.trim() || "PENDIENTE",
		makeCode: dto.makeCode ?? null,
		model: null,
		modelYear: new Date().getUTCFullYear(),
		manufacturer: null,
		color: null,
		engineNumber: null,

		nhtsaDecodedAt: null,
		nhtsaDecodeStatus: "not_attempted",
		nhtsaRawData: null,

		fuelType: dto.fuelType ?? "diesel",
		fuelTypeCodeSAT: null,
		engineMake: null,
		engineModel: null,
		engineDisplacementL: null,
		enginePowerHp: null,
		engineTorqueLbFt: null,
		fuelTanks: [],
		defTankCapacityL: null,
		nominalConsumptionLPer100Km: null,

		transmissionType: "manual",
		transmissionMake: null,
		transmissionModel: null,
		driveAxleConfig: "6x4",
		rearAxleRatio: null,

		// Defaults numéricos pendientes — el detalle marcará "incompleto"
		pbvKg: 0,
		taraKg: 0,
		gvwrLb: null,
		lengthMeters: null,
		widthMeters: null,
		heightMeters: null,
		axleCount: 2,
		hasABS: false,
		hasAuxiliaryPowerUnit: false,
		cabType: null,

		brakeFrictionType: null,
		brakeActuationType: null,
		suspensionType: null,
		suspensionBrand: null,

		ownership,

		currentOperatorId: null,
		currentOperatorAssignedAt: null,
		activePolicyId: null,

		photos: {leftSide: null, rightSide: null, front: null, rear: null},
		documents: [],

		createdBy: new ObjectId(actorId),
		updatedBy: new ObjectId(actorId),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertUnit(doc);

	logger.info(
		{orgId, unitId: created.id, vin: created.vin},
		"Unit quick-registered",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_quick_registered",
		target: {type: "unit", id: created.id, displayName: created.vin},
		metadata: {
			satConfigCode: created.satConfigCode,
			businessPartnerId: created.ownership.businessPartnerId,
		},
		context,
	});

	return created;
}

// ── Actualizar ─────────────────────────────────────────────────────────────

export async function updateUnit(
	orgId: string,
	id: string,
	actorId: string,
	dto: UpdateUnitDto,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, id);
	if (!existing) throw new NotFoundError("Unit");

	if (dto.satConfigCode) assertSatConfigCode(dto.satConfigCode);
	if (dto.sctPermitType) assertSctPermitType(dto.sctPermitType);
	if (dto.fuelTypeCodeSAT) assertFuelTypeSatCode(dto.fuelTypeCodeSAT);
	if (dto.ownership) await assertOwnershipCoherence(orgId, dto.ownership);

	const mergedSatConfigCode = (dto.satConfigCode ?? existing.satConfigCode).toUpperCase();
	enforceConditionalFields({
		satConfigCode: mergedSatConfigCode,
		fuelType: dto.fuelType ?? existing.fuelType,
		modelYear: dto.modelYear ?? existing.modelYear,
		fuelTanks: dto.fuelTanks ?? existing.fuelTanks,
		defTankCapacityL:
			dto.defTankCapacityL !== undefined ? dto.defTankCapacityL : existing.defTankCapacityL,
		engineDisplacementL:
			dto.engineDisplacementL !== undefined
				? dto.engineDisplacementL
				: existing.engineDisplacementL,
		cabType: dto.cabType !== undefined ? dto.cabType : existing.cabType,
		engineMake: dto.engineMake !== undefined ? dto.engineMake : existing.engineMake,
		enginePowerHp:
			dto.enginePowerHp !== undefined ? dto.enginePowerHp : existing.enginePowerHp,
		nominalConsumptionLPer100Km:
			dto.nominalConsumptionLPer100Km !== undefined
				? dto.nominalConsumptionLPer100Km
				: existing.nominalConsumptionLPer100Km,
	});

	const fields: Partial<UnitDocument> = {updatedBy: new ObjectId(actorId)};

	if (dto.plates) {
		fields.plates = {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		};
	}
	if (dto.satConfigCode) fields.satConfigCode = dto.satConfigCode.toUpperCase();
	if (dto.sctPermitType !== undefined) {
		fields.sctPermitType = dto.sctPermitType?.toUpperCase().trim() || null;
	}
	if (dto.sctPermitNumber !== undefined) {
		fields.sctPermitNumber = dto.sctPermitNumber?.trim() || null;
	}
	if (dto.economicNumber !== undefined) {
		fields.economicNumber = dto.economicNumber?.trim() || null;
	}

	if (dto.make !== undefined) fields.make = dto.make.trim();
	if (dto.makeCode !== undefined) fields.makeCode = dto.makeCode;
	if (dto.model !== undefined) fields.model = dto.model?.trim() || null;
	if (dto.modelYear !== undefined) fields.modelYear = dto.modelYear;
	if (dto.manufacturer !== undefined) {
		fields.manufacturer = dto.manufacturer?.trim() || null;
	}
	if (dto.color !== undefined) fields.color = dto.color?.trim() || null;
	if (dto.engineNumber !== undefined) {
		fields.engineNumber = dto.engineNumber?.trim() || null;
	}

	const directKeys = [
		"fuelType",
		"fuelTypeCodeSAT",
		"engineMake",
		"engineModel",
		"engineDisplacementL",
		"enginePowerHp",
		"engineTorqueLbFt",
		"defTankCapacityL",
		"nominalConsumptionLPer100Km",
		"transmissionType",
		"transmissionMake",
		"transmissionModel",
		"driveAxleConfig",
		"rearAxleRatio",
		"pbvKg",
		"taraKg",
		"gvwrLb",
		"lengthMeters",
		"widthMeters",
		"heightMeters",
		"axleCount",
		"hasABS",
		"hasAuxiliaryPowerUnit",
		"cabType",
		"brakeFrictionType",
		"brakeActuationType",
		"suspensionType",
		"suspensionBrand",
	] as const;
	for (const k of directKeys) {
		if (dto[k] !== undefined) {
			(fields as Record<string, unknown>)[k] = dto[k];
		}
	}

	if (dto.fuelTanks !== undefined) {
		fields.fuelTanks = normalizeFuelTanks(dto.fuelTanks ?? []);
	}

	if (dto.ownership) {
		fields.ownership = await buildOwnershipDocument(dto.ownership, new Date());
	}

	const updated = await updateUnitFields(orgId, id, fields);
	if (!updated) throw new NotFoundError("Unit");

	await emitAuditEvent({
		category: "units",
		action: "unit_updated",
		target: {type: "unit", id, displayName: updated.vin},
		metadata: {fieldsChanged: Object.keys(fields).filter((k) => k !== "updatedBy")},
		context,
	});

	return updated;
}

// ── Cambio de status (máquina de estados) ─────────────────────────────────

const ALLOWED_TRANSITIONS: Record<UnitStatus, ReadonlySet<UnitStatus>> = {
	available: new Set([
		"assigned",
		"in_maintenance",
		"out_of_service",
		"decommissioned",
		"returned_to_partner",
	]),
	assigned: new Set(["available", "in_route", "in_maintenance"]),
	in_route: new Set(["assigned", "available"]),
	in_maintenance: new Set(["available", "out_of_service"]),
	out_of_service: new Set(["available", "decommissioned"]),
	decommissioned: new Set(),
	returned_to_partner: new Set(),
};

export async function transitionUnitStatus(
	orgId: string,
	id: string,
	actorId: string,
	newStatus: UnitStatus,
	reason: string | null,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, id);
	if (!existing) throw new NotFoundError("Unit");

	if (existing.status === newStatus) return existing;

	const allowed = ALLOWED_TRANSITIONS[existing.status];
	if (!allowed.has(newStatus)) {
		throw new ValidationError(
			`Transición ilegal: ${existing.status} → ${newStatus}`,
		);
	}

	if (newStatus === "returned_to_partner" && existing.ownership.type !== "exchange") {
		throw new ValidationError(
			"Solo unidades en intercambio pueden ser 'returned_to_partner'",
		);
	}

	if (newStatus === "assigned" && !existing.currentOperatorId) {
		throw new ValidationError(
			"No se puede pasar a 'assigned' sin operador. Asigna un operador primero.",
		);
	}

	const updated = await updateUnitFields(orgId, id, {
		status: newStatus,
		updatedBy: new ObjectId(actorId),
	});
	if (!updated) throw new NotFoundError("Unit");

	const action =
		newStatus === "decommissioned"
			? "unit_decommissioned"
			: newStatus === "returned_to_partner"
				? "unit_returned_to_partner"
				: "unit_status_changed";

	await emitAuditEvent({
		category: "units",
		action,
		target: {type: "unit", id, displayName: updated.vin},
		diff: {
			status: {old: existing.status, new: newStatus},
		},
		metadata: {reason: reason ?? null},
		context,
	});

	return updated;
}

// ── Asignación de operador ────────────────────────────────────────────────

export async function assignOperatorToUnit(
	orgId: string,
	unitId: string,
	actorId: string,
	operatorEmployeeId: string,
	notes: string | null,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, unitId);
	if (!existing) throw new NotFoundError("Unit");

	if (existing.status === "decommissioned" || existing.status === "returned_to_partner") {
		throw new ValidationError(
			`No se puede asignar operador a una unidad en estado '${existing.status}'`,
		);
	}

	const employee = await findEmployeeById(operatorEmployeeId, orgId);
	if (!employee) throw new ValidationError("Empleado operador no encontrado");

	const profile = employee.employeeProfile;
	if (!profile?.vehicleOperator?.isOperator) {
		throw new ValidationError(
			"El empleado seleccionado no está marcado como operador (vehicleOperator.isOperator=false)",
		);
	}

	// El operador no puede estar asignado activo a otra unidad
	const existingAssignment = await findUnitByCurrentOperator(orgId, operatorEmployeeId);
	if (existingAssignment && existingAssignment.id !== unitId) {
		throw new ValidationError(
			`El operador ya está asignado a la unidad ${existingAssignment.economicNumber || existingAssignment.vin}. Libéralo primero.`,
		);
	}

	const now = new Date();
	const updated = await updateUnitFields(orgId, unitId, {
		currentOperatorId: new ObjectId(operatorEmployeeId),
		currentOperatorAssignedAt: now,
		updatedBy: new ObjectId(actorId),
	});
	if (!updated) throw new NotFoundError("Unit");

	// Sincronía con Employee.vehicleOperator.currentUnitId mientras dura el
	// doble-modelo (deprecación final tras un ciclo en producción).
	await updateEmployeeCurrentUnit(operatorEmployeeId, orgId, unitId);

	logger.info(
		{orgId, unitId, operatorEmployeeId},
		"Operator assigned to unit",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_operator_assigned",
		target: {type: "unit", id: unitId, displayName: updated.vin},
		metadata: {
			operatorEmployeeId,
			previousOperatorId: existing.currentOperatorId,
			notes: notes ?? null,
		},
		context,
	});

	return updated;
}

export async function unassignOperatorFromUnit(
	orgId: string,
	unitId: string,
	actorId: string,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, unitId);
	if (!existing) throw new NotFoundError("Unit");

	if (!existing.currentOperatorId) {
		throw new ValidationError("La unidad no tiene operador asignado");
	}

	const previousOperatorId = existing.currentOperatorId;

	const updated = await updateUnitFields(orgId, unitId, {
		currentOperatorId: null,
		currentOperatorAssignedAt: null,
		updatedBy: new ObjectId(actorId),
	});
	if (!updated) throw new NotFoundError("Unit");

	// Sincronía con Employee
	await updateEmployeeCurrentUnit(previousOperatorId, orgId, null);

	logger.info(
		{orgId, unitId, previousOperatorId},
		"Operator unassigned from unit",
	);

	await emitAuditEvent({
		category: "units",
		action: "unit_operator_unassigned",
		target: {type: "unit", id: unitId, displayName: updated.vin},
		metadata: {previousOperatorId},
		context,
	});

	return updated;
}

// ── Fotos (4 slots: lados, frontal, trasero) ────────────────────────────

export async function setUnitPhoto(
	orgId: string,
	unitId: string,
	actorId: string,
	position: UnitPhotoPosition,
	file: Express.Multer.File,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, unitId);
	if (!existing) throw new NotFoundError("Unit");

	validateFile(file.mimetype, file.size);
	if (!file.mimetype.startsWith("image/")) {
		throw new ValidationError("Solo se aceptan imágenes (JPG, PNG)");
	}

	const key = generateS3Key("units", orgId, unitId, "photos", `${position}-${Date.now()}-${file.originalname}`);
	const upload = await uploadFile(key, file.buffer, file.mimetype);

	const previous = existing.photos[position];

	const now = new Date();
	const updated = await updateUnitFields(orgId, unitId, {
		[`photos.${position}`]: {
			fileUrl: upload.url,
			fileSize: upload.fileSize,
			mimeType: upload.mimeType,
			uploadedAt: now,
			uploadedBy: new ObjectId(actorId),
		},
		updatedBy: new ObjectId(actorId),
	} as Partial<UnitDocument>);
	if (!updated) throw new NotFoundError("Unit");

	// Borrar la foto anterior de S3 (best effort, no bloqueante)
	if (previous?.fileUrl) {
		void deleteFile(extractKeyFromUrl(previous.fileUrl));
	}

	logger.info({orgId, unitId, position, key}, "Unit photo uploaded");

	await emitAuditEvent({
		category: "units",
		action: "unit_photo_uploaded",
		target: {type: "unit", id: unitId, displayName: updated.vin},
		metadata: {position, fileSize: upload.fileSize, replacedPrevious: !!previous},
		context,
	});

	return updated;
}

export async function removeUnitPhoto(
	orgId: string,
	unitId: string,
	actorId: string,
	position: UnitPhotoPosition,
	context: AuditContext,
): Promise<Unit> {
	const existing = await findUnitById(orgId, unitId);
	if (!existing) throw new NotFoundError("Unit");

	const previous = existing.photos[position];
	if (!previous) {
		throw new ValidationError(`No hay foto ${position} para eliminar`);
	}

	const updated = await updateUnitFields(orgId, unitId, {
		[`photos.${position}`]: null,
		updatedBy: new ObjectId(actorId),
	} as Partial<UnitDocument>);
	if (!updated) throw new NotFoundError("Unit");

	void deleteFile(extractKeyFromUrl(previous.fileUrl));

	logger.info({orgId, unitId, position}, "Unit photo removed");

	await emitAuditEvent({
		category: "units",
		action: "unit_photo_deleted",
		target: {type: "unit", id: unitId, displayName: updated.vin},
		metadata: {position, previousFileUrl: previous.fileUrl},
		context,
	});

	return updated;
}

// ── Decode VIN (NHTSA vPIC) ────────────────────────────────────────────────

export async function decodeUnitVin(rawVin: string): Promise<DecodeUnitVinResponse> {
	const result = validateVin(rawVin);
	if (!result.valid) {
		const message = (() => {
			switch (result.reason) {
				case "wrong_length":
					return "VIN debe tener exactamente 17 caracteres";
				case "invalid_chars":
					return "VIN solo admite letras y números en mayúsculas";
				case "forbidden_letter":
					return "VIN no puede contener I, O ni Q";
				case "invalid_check_digit":
					return `Dígito verificador inválido — esperado "${result.expectedCheckDigit}"`;
				default:
					return "VIN inválido";
			}
		})();
		throw new ValidationError(message);
	}

	const safeVin = rawVin.toUpperCase().trim();

	try {
		const raw = await decodeVinValues(safeVin);
		return mapNhtsaUnitResponse(raw, safeVin);
	} catch (err) {
		logger.warn(
			{err, vin: safeVin},
			"NHTSA decode failed — returning decodeStatus='failed'",
		);
		return {decodeStatus: "failed", data: null, rawData: null};
	}
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function deleteUnit(
	orgId: string,
	id: string,
	context: AuditContext,
): Promise<void> {
	const existing = await findUnitById(orgId, id);
	if (!existing) throw new NotFoundError("Unit");

	if (existing.currentOperatorId) {
		throw new ValidationError(
			"No se puede eliminar una unidad con operador asignado. Libera al operador primero.",
		);
	}

	const ok = await softDeleteUnit(orgId, id);
	if (!ok) throw new NotFoundError("Unit");

	logger.info({orgId, unitId: id}, "Unit soft-deleted");

	await emitAuditEvent({
		category: "units",
		action: "unit_deleted",
		target: {type: "unit", id, displayName: existing.vin},
		context,
	});
}

// ── Enrich (hydrate ownership y operador) ─────────────────────────────────

async function enrichOwnerships(orgId: string, units: Unit[]): Promise<Unit[]> {
	if (units.length === 0) return units;

	const partnerIds = new Set<string>();
	const taxIdIds = new Set<string>();
	for (const u of units) {
		if (u.ownership.type === "owned" && u.ownership.internalTaxIdId) {
			taxIdIds.add(u.ownership.internalTaxIdId);
		} else if (u.ownership.type !== "owned" && u.ownership.businessPartnerId) {
			partnerIds.add(u.ownership.businessPartnerId);
		}
	}

	const [partnerById, taxIdById] = await Promise.all([
		(async () => {
			const map = new Map<string, Awaited<ReturnType<typeof findBusinessPartnerById>>>();
			await Promise.all(
				Array.from(partnerIds).map(async (id) => {
					map.set(id, await findBusinessPartnerById(orgId, id));
				}),
			);
			return map;
		})(),
		(async () => {
			const map = new Map<string, Awaited<ReturnType<typeof findTaxId>>>();
			await Promise.all(
				Array.from(taxIdIds).map(async (id) => {
					map.set(id, await findTaxId(orgId, id));
				}),
			);
			return map;
		})(),
	]);

	for (const u of units) {
		if (u.ownership.type === "owned" && u.ownership.internalTaxIdId) {
			const taxId = taxIdById.get(u.ownership.internalTaxIdId);
			if (taxId) {
				u.ownership.internalTaxId = {
					id: taxId.id,
					rfc: taxId.rfc,
					razonSocial: taxId.razonSocial,
				};
			}
		} else if (u.ownership.type !== "owned" && u.ownership.businessPartnerId) {
			const partner = partnerById.get(u.ownership.businessPartnerId);
			if (partner) {
				u.ownership.businessPartner = {
					id: partner.id,
					legalName: partner.legalName,
					commercialName: partner.commercialName,
					rfc: partner.rfc,
					foreignTaxId: partner.foreignTaxId,
					taxRegime: partner.taxRegime,
				};
			}
		}
	}

	return units;
}

async function enrichOperators(orgId: string, units: Unit[]): Promise<Unit[]> {
	const operatorIds = Array.from(
		new Set(units.map((u) => u.currentOperatorId).filter((id): id is string => !!id)),
	);
	if (operatorIds.length === 0) return units;

	const summaries = new Map<string, UnitOperatorSummary>();
	await Promise.all(
		operatorIds.map(async (id) => {
			const employee = await findEmployeeById(id, orgId);
			if (!employee) return;
			const profile = employee.employeeProfile;
			const fullName = employee.displayName?.trim() || `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
			summaries.set(id, {
				id,
				fullName: fullName || "(sin nombre)",
				employeeNumber: null,
				driverStatus: profile?.vehicleOperator?.driverStatus ?? null,
			});
		}),
	);

	for (const u of units) {
		if (u.currentOperatorId) {
			u.currentOperator = summaries.get(u.currentOperatorId) ?? null;
		}
	}

	return units;
}

// ── Helpers de validación ─────────────────────────────────────────────────

function assertSatConfigCode(code: string): void {
	if (!isUnitConfigCode(code.toUpperCase())) {
		throw new ValidationError(
			`satConfigCode "${code}" no existe en el catálogo. Configuraciones soportadas: ver UNIT_CONFIG_CATALOG.`,
		);
	}
}

function assertSctPermitType(code: string): void {
	if (!isUnitSctPermitCode(code.toUpperCase().trim())) {
		throw new ValidationError(
			`sctPermitType "${code}" no es un código válido de c_TipoPermiso (TPAFxx).`,
		);
	}
}

function assertFuelTypeSatCode(code: string): void {
	if (!isUnitFuelSatCode(code)) {
		throw new ValidationError(
			`fuelTypeCodeSAT "${code}" no es un código válido de c_TipoCombustible.`,
		);
	}
}

interface ConditionalFieldsInput {
	satConfigCode: string;
	fuelType: UnitDocument["fuelType"];
	modelYear: number;
	fuelTanks: ReadonlyArray<FuelTank | {position: string; capacityL: number}>;
	defTankCapacityL: number | null;
	engineDisplacementL: number | null;
	cabType: UnitDocument["cabType"];
	engineMake: string | null;
	enginePowerHp: number | null;
	nominalConsumptionLPer100Km: number | null;
}

function enforceConditionalFields(input: ConditionalFieldsInput): void {
	const code = input.satConfigCode.toUpperCase();
	const cfg = getUnitConfig(code);
	if (!cfg) return; // ya validado arriba

	// Tractocamiones: cabType, engineMake, enginePowerHp requeridos
	if (isTractorConfig(code)) {
		if (!input.cabType) {
			throw new ValidationError(
				`cabType es requerido para configuración ${code} (tractocamión)`,
			);
		}
		if (!input.engineMake) {
			throw new ValidationError(
				`engineMake es requerido para configuración ${code} (tractocamión)`,
			);
		}
		if (input.enginePowerHp == null || input.enginePowerHp <= 0) {
			throw new ValidationError(
				`enginePowerHp es requerido para configuración ${code} (tractocamión)`,
			);
		}
	}

	// Vehículos ligeros / sedan: cabType debe ser null (no aplica)
	if (isLightVehicleConfig(code) && input.cabType) {
		throw new ValidationError(
			`cabType no aplica para configuración ${code} (vehículo ligero o administrativo)`,
		);
	}

	// Combustible: electric → no fuelTanks ni engineDisplacementL ni defTank
	if (input.fuelType === "electric") {
		if (input.fuelTanks.length > 0) {
			throw new ValidationError("fuelTanks debe estar vacío para fuelType='electric'");
		}
		if (input.engineDisplacementL != null) {
			throw new ValidationError(
				"engineDisplacementL debe ser null para fuelType='electric'",
			);
		}
		if (input.defTankCapacityL != null) {
			throw new ValidationError(
				"defTankCapacityL debe ser null para fuelType='electric'",
			);
		}
	}

	// Hidrógeno: igual que electric (sin tanque diésel ni DEF)
	if (input.fuelType === "hydrogen") {
		if (input.defTankCapacityL != null) {
			throw new ValidationError(
				"defTankCapacityL debe ser null para fuelType='hydrogen'",
			);
		}
	}

	// Gasolina/CNG/LNG/LPG: defTank no aplica (solo SCR de diesel/hybrid usa)
	if (
		input.fuelType === "gasoline" ||
		input.fuelType === "cng" ||
		input.fuelType === "lng" ||
		input.fuelType === "lpg"
	) {
		if (input.defTankCapacityL != null) {
			throw new ValidationError(
				`defTankCapacityL no aplica para fuelType='${input.fuelType}'`,
			);
		}
	}

	// Validar tanques de combustible
	const seenPositions = new Set<string>();
	for (const tank of input.fuelTanks) {
		if (tank.capacityL == null || tank.capacityL <= 0) {
			throw new ValidationError(
				`fuelTanks[].capacityL debe ser > 0 (recibido: ${tank.capacityL})`,
			);
		}
		if (seenPositions.has(tank.position)) {
			throw new ValidationError(
				`fuelTanks contiene dos tanques con position='${tank.position}' (debe ser único)`,
			);
		}
		seenPositions.add(tank.position);
	}

	if (input.defTankCapacityL != null && input.defTankCapacityL <= 0) {
		throw new ValidationError("defTankCapacityL debe ser > 0 si se provee");
	}

	if (
		input.nominalConsumptionLPer100Km != null &&
		input.nominalConsumptionLPer100Km <= 0
	) {
		throw new ValidationError("nominalConsumptionLPer100Km debe ser > 0 si se provee");
	}
}

async function assertOwnershipCoherence(
	orgId: string,
	ownership: UnitOwnershipInput,
): Promise<void> {
	if (ownership.type === "owned") {
		if (!ownership.internalTaxIdId) {
			throw new ValidationError(
				"internalTaxIdId requerido cuando ownership.type='owned'",
			);
		}
		const taxId = await findTaxId(orgId, ownership.internalTaxIdId);
		if (!taxId) throw new ValidationError("internalTaxIdId no encontrado");
		if (!taxId.isActive) {
			throw new ValidationError("El RFC interno seleccionado está inactivo");
		}
		return;
	}

	if (!ownership.businessPartnerId) {
		throw new ValidationError(
			"businessPartnerId requerido cuando ownership.type≠'owned'",
		);
	}

	const partner = await findBusinessPartnerById(orgId, ownership.businessPartnerId);
	if (!partner) throw new ValidationError("businessPartnerId no encontrado");
	if (!partner.isActive) {
		throw new ValidationError("El socio comercial seleccionado está inactivo");
	}

	if (ownership.type === "exchange") {
		if (!partner.roles.includes("trailer_exchange_partner")) {
			throw new ValidationError(
				"El socio comercial debe tener el rol 'trailer_exchange_partner' para intercambio",
			);
		}
	}
}

async function buildOwnershipDocument(
	input: UnitOwnershipInput,
	now: Date,
): Promise<UnitOwnershipDocument> {
	const contract: UnitContractDocument | null = input.contract
		? {
				contractNumber: input.contract.contractNumber ?? null,
				startDate: new Date(input.contract.startDate ?? now),
				endDate: input.contract.endDate ? new Date(input.contract.endDate) : null,
				terminationNotice: input.contract.terminationNotice ?? null,
				rentAmount: input.contract.rentAmount ?? null,
				rentCurrency: input.contract.rentCurrency ?? null,
				rentFrequency: input.contract.rentFrequency ?? null,
				exchangeReference: input.contract.exchangeReference ?? null,
				expectedReturnDate: input.contract.expectedReturnDate
					? new Date(input.contract.expectedReturnDate)
					: null,
				contractDocumentUrl: input.contract.contractDocumentUrl ?? null,
				notes: input.contract.notes ?? null,
			}
		: null;

	return {
		type: input.type,
		internalTaxIdId:
			input.type === "owned" && input.internalTaxIdId
				? new ObjectId(input.internalTaxIdId)
				: null,
		businessPartnerId:
			input.type !== "owned" && input.businessPartnerId
				? new ObjectId(input.businessPartnerId)
				: null,
		contract,
	};
}

function normalizeFuelTanks(input: ReadonlyArray<{
	position: string;
	capacityL: number;
	side?: string | null;
	notes?: string | null;
}>): FuelTank[] {
	return input.map((t) => ({
		position: t.position as FuelTank["position"],
		capacityL: t.capacityL,
		side: (t.side ?? null) as FuelTank["side"],
		notes: t.notes ?? null,
	}));
}

/**
 * Placeholder VIN para quick-register cuando el operador no puede leer el VIN
 * en el momento. Mismo patrón que trailers.
 */
function generatePlaceholderVin(plates: {
	mx?: string | null;
	us?: string | null;
}): string {
	const seed = (plates.mx ?? plates.us ?? "UNKNOWN")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 8);
	const ts = Date.now().toString(36).toUpperCase().slice(-6);
	const raw = `QR${seed}${ts}`;
	const cleaned = raw.replace(/[IOQ]/g, "X");
	return cleaned.padEnd(17, "0").slice(0, 17);
}

// ── Re-exports usados por otros módulos (cascade-block, etc.) ─────────────

export {findUnitByCurrentOperator};
