import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {decodeVinValues} from "../../infrastructure/http/nhtsaClient";
import {
	NotFoundError,
	ValidationError,
} from "../../shared/errors/AppError";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {findBusinessPartnerById} from "../business-partners/business-partners.repository";
import {getSatCatalog} from "../catalogs/catalogs.service";
import {findTaxId} from "../organizations/taxId.repository";

import {getCtrCharacteristic} from "./constants/ctrCharacteristics.constants";
import {mapNhtsaResponse, type DecodeVinResponse} from "./helpers/nhtsa-mapper";
import {normalizePlate} from "./helpers/plate-normalizer";
import {validateVin} from "./helpers/vin-validator";
import {
	findTrailerByEconomicNumber,
	findTrailerById,
	findTrailerByPlate,
	findTrailerByVin,
	findTrailers,
	insertTrailer,
	softDeleteTrailer,
	updateTrailerFields,
} from "./trailers.repository";
import type {
	CreateTrailerDto,
	QuickRegisterTrailerDto,
	Trailer,
	TrailerContractDocument,
	TrailerDocument,
	TrailerOwnershipDocument,
	TrailerOwnershipInput,
	TrailerQueryFilter,
	TrailerStatus,
	UpdateTrailerDto,
} from "./trailers.types";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listTrailers(
	orgId: string,
	filter: TrailerQueryFilter,
): Promise<{trailers: Trailer[]; total: number}> {
	const result = await findTrailers(orgId, filter);
	const enriched = await enrichOwnerships(orgId, result.trailers);
	return {trailers: enriched, total: result.total};
}

export async function getTrailer(orgId: string, id: string): Promise<Trailer> {
	const trailer = await findTrailerById(orgId, id);
	if (!trailer) throw new NotFoundError("Trailer");
	const [enriched] = await enrichOwnerships(orgId, [trailer]);
	return enriched ?? trailer;
}

// ── Check de duplicados (pre-validation del wizard) ──────────────────────

export interface CheckDuplicatesInput {
	vin?: string | null;
	plates_mx?: string | null;
	plates_us?: string | null;
	economicNumber?: string | null;
	/** Si se pasa, se ignoran coincidencias con este trailer (modo edit). */
	excludeTrailerId?: string | null;
}

export interface DuplicateMatch {
	field: "vin" | "plates_mx" | "plates_us" | "economicNumber";
	value: string;
	trailer: {
		id: string;
		vin: string;
		economicNumber: string | null;
		plates: {mx: string | null; us: string | null};
		status: Trailer["status"];
	};
}

/**
 * Busca duplicados de VIN, placas y número económico en la org del usuario.
 * Devuelve la lista de coincidencias (puede ser vacía si todo está libre).
 * Excluye soft-deleted (porque al eliminar se libera el VIN/placa/económico).
 */
export async function checkTrailerDuplicates(
	orgId: string,
	input: CheckDuplicatesInput,
): Promise<DuplicateMatch[]> {
	const matches: DuplicateMatch[] = [];

	const tryAdd = (
		field: DuplicateMatch["field"],
		value: string,
		trailer: Trailer | null,
	): void => {
		if (!trailer) return;
		if (input.excludeTrailerId && trailer.id === input.excludeTrailerId) return;
		matches.push({
			field,
			value,
			trailer: {
				id: trailer.id,
				vin: trailer.vin,
				economicNumber: trailer.economicNumber,
				plates: {mx: trailer.plates.mx, us: trailer.plates.us},
				status: trailer.status,
			},
		});
	};

	const lookups: Promise<void>[] = [];

	if (input.vin) {
		const vin = input.vin.toUpperCase().trim();
		if (vin.length === 17) {
			lookups.push(
				findTrailerByVin(orgId, vin).then((t) => tryAdd("vin", vin, t)),
			);
		}
	}
	if (input.plates_mx) {
		const plate = input.plates_mx.toUpperCase().trim();
		lookups.push(
			findTrailerByPlate(orgId, "mx", plate).then((t) => tryAdd("plates_mx", plate, t)),
		);
	}
	if (input.plates_us) {
		const plate = input.plates_us.toUpperCase().trim();
		lookups.push(
			findTrailerByPlate(orgId, "us", plate).then((t) => tryAdd("plates_us", plate, t)),
		);
	}
	if (input.economicNumber) {
		const eco = input.economicNumber.trim();
		lookups.push(
			findTrailerByEconomicNumber(orgId, eco).then((t) =>
				tryAdd("economicNumber", eco, t),
			),
		);
	}

	await Promise.all(lookups);

	return matches;
}

/**
 * Hidrata `ownership.businessPartner` o `ownership.internalTaxId` con los
 * datos mínimos necesarios para mostrar nombre + RFC en la UI sin un fetch
 * adicional por trailer. Hace batch lookup para evitar N+1: una sola query
 * a business-partners (con $in) y un solo fetch del organization doc para
 * los taxIds (que son subdocs).
 */
async function enrichOwnerships(orgId: string, trailers: Trailer[]): Promise<Trailer[]> {
	if (trailers.length === 0) return trailers;

	// Recolectar IDs únicos
	const partnerIds = new Set<string>();
	const taxIdIds = new Set<string>();
	for (const t of trailers) {
		if (t.ownership.type === "owned" && t.ownership.internalTaxIdId) {
			taxIdIds.add(t.ownership.internalTaxIdId);
		} else if (t.ownership.type !== "owned" && t.ownership.businessPartnerId) {
			partnerIds.add(t.ownership.businessPartnerId);
		}
	}

	// Batch lookup de partners (1 query) y taxIds (1 query al org doc por id)
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

	for (const t of trailers) {
		if (t.ownership.type === "owned" && t.ownership.internalTaxIdId) {
			const taxId = taxIdById.get(t.ownership.internalTaxIdId);
			if (taxId) {
				t.ownership.internalTaxId = {
					id: taxId.id,
					rfc: taxId.rfc,
					razonSocial: taxId.razonSocial,
				};
			}
		} else if (t.ownership.type !== "owned" && t.ownership.businessPartnerId) {
			const partner = partnerById.get(t.ownership.businessPartnerId);
			if (partner) {
				t.ownership.businessPartner = {
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

	return trailers;
}

// ── Crear (alta completa) ──────────────────────────────────────────────────

export async function createTrailer(
	orgId: string,
	actorId: string,
	dto: CreateTrailerDto,
	context: AuditContext,
): Promise<Trailer> {
	// V7: ctrSubtype existe en el catálogo SAT cacheado
	await assertCtrSubtypeExists(dto.ctrSubtype);

	// V18/V19: campos condicionales según el subtipo
	enforceConditionalFields(dto);

	// V10/V11/V12: validaciones de propiedad cross-resource
	await assertOwnershipCoherence(orgId, dto.ownership);

	const now = new Date();
	const ownership = await buildOwnershipDocument(dto.ownership, now);

	const doc: Omit<TrailerDocument, "_id"> = {
		orgId: new ObjectId(orgId),

		vin: dto.vin.toUpperCase().trim(),
		plates: {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		},
		ctrSubtype: dto.ctrSubtype.toUpperCase(),
		economicNumber: dto.economicNumber?.trim() || null,
		status: "available",

		make: dto.make.trim(),
		makeCode: dto.makeCode ?? null,
		model: dto.model?.trim() || null,
		modelYear: dto.modelYear,
		manufacturer: dto.manufacturer?.trim() || null,

		nhtsaDecodedAt: dto.nhtsaDecodedAt ? new Date(dto.nhtsaDecodedAt) : null,
		nhtsaDecodeStatus: dto.nhtsaDecodeStatus ?? null,
		nhtsaRawData: dto.nhtsaRawData ?? null,

		pbvdKg: dto.pbvdKg,
		taraKg: dto.taraKg,
		lengthMeters: dto.lengthMeters,
		widthMeters: dto.widthMeters,
		heightMeters: dto.heightMeters,
		axleCount: dto.axleCount,
		axleConfiguration: dto.axleConfiguration,
		hasLiftAxle: dto.hasLiftAxle,
		tirePositionCount: dto.tirePositionCount,

		suspensionType: dto.suspensionType ?? null,
		suspensionBrand: dto.suspensionBrand ?? null,
		brakeFrictionType: dto.brakeFrictionType ?? null,
		brakeActuationType: dto.brakeActuationType ?? null,
		hasABS: dto.hasABS ?? null,
		slackAdjusterType: dto.slackAdjusterType ?? null,

		kingpinDiameterInches: dto.kingpinDiameterInches ?? null,
		hasLandingGear: dto.hasLandingGear ?? null,

		voltageSystem: dto.voltageSystem ?? null,
		hasAuxiliaryPowerUnit: dto.hasAuxiliaryPowerUnit ?? null,

		wallMaterial: dto.wallMaterial ?? null,
		floorMaterial: dto.floorMaterial ?? null,
		rearDoorType: dto.rearDoorType ?? null,
		hasSideDoor: dto.hasSideDoor ?? null,
		interiorHeightMeters: dto.interiorHeightMeters ?? null,

		ownership,
		documents: [],

		createdBy: new ObjectId(actorId),
		updatedBy: new ObjectId(actorId),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertTrailer(doc);

	logger.info(
		{orgId, trailerId: created.id, vin: created.vin},
		"Trailer created",
	);

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_created",
		target: {type: "trailer", id: created.id, displayName: created.vin},
		metadata: {
			ctrSubtype: created.ctrSubtype,
			ownershipType: created.ownership.type,
		},
		context,
	});

	return created;
}

// ── Quick register (intercambio temporal) ──────────────────────────────────

export async function quickRegisterTrailer(
	orgId: string,
	actorId: string,
	dto: QuickRegisterTrailerDto,
	context: AuditContext,
): Promise<Trailer> {
	await assertCtrSubtypeExists(dto.ctrSubtype);

	// Forzar tipo a 'exchange' y validar role del partner
	const ownershipInput: TrailerOwnershipInput = {
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

	// Quick-register: campos técnicos van en sus defaults; el operador rellena
	// después en alta completa cuando tenga la info de la unidad. Esto refleja
	// la realidad operativa: en intercambio recibes el equipo con prisa.
	const doc: Omit<TrailerDocument, "_id"> = {
		orgId: new ObjectId(orgId),

		vin: (dto.vin ?? generatePlaceholderVin(dto.plates)).toUpperCase().trim(),
		plates: {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		},
		ctrSubtype: dto.ctrSubtype.toUpperCase(),
		economicNumber: dto.economicNumber?.trim() || null,
		status: "available",

		make: dto.make?.trim() || "PENDIENTE",
		makeCode: dto.makeCode ?? null,
		model: null,
		modelYear: new Date().getUTCFullYear(),
		manufacturer: null,

		nhtsaDecodedAt: null,
		nhtsaDecodeStatus: "not_attempted",
		nhtsaRawData: null,

		// Defaults numéricos pendientes de captura — el detalle marcará "incompleto"
		pbvdKg: 0,
		taraKg: 0,
		lengthMeters: 0,
		widthMeters: 0,
		heightMeters: 0,
		axleCount: 2,
		axleConfiguration: "tandem",
		hasLiftAxle: false,
		tirePositionCount: 8,

		suspensionType: null,
		suspensionBrand: null,
		brakeFrictionType: null,
		brakeActuationType: null,
		hasABS: null,
		slackAdjusterType: null,
		kingpinDiameterInches: null,
		hasLandingGear: null,
		voltageSystem: null,
		hasAuxiliaryPowerUnit: null,
		wallMaterial: null,
		floorMaterial: null,
		rearDoorType: null,
		hasSideDoor: null,
		interiorHeightMeters: null,

		ownership,
		documents: [],

		createdBy: new ObjectId(actorId),
		updatedBy: new ObjectId(actorId),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertTrailer(doc);

	logger.info(
		{orgId, trailerId: created.id, vin: created.vin},
		"Trailer quick-registered",
	);

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_quick_registered",
		target: {type: "trailer", id: created.id, displayName: created.vin},
		metadata: {ctrSubtype: created.ctrSubtype, businessPartnerId: created.ownership.businessPartnerId},
		context,
	});

	return created;
}

// ── Actualizar ─────────────────────────────────────────────────────────────

export async function updateTrailer(
	orgId: string,
	id: string,
	actorId: string,
	dto: UpdateTrailerDto,
	context: AuditContext,
): Promise<Trailer> {
	const existing = await findTrailerById(orgId, id);
	if (!existing) throw new NotFoundError("Trailer");

	if (dto.ctrSubtype) await assertCtrSubtypeExists(dto.ctrSubtype);
	if (dto.ownership) await assertOwnershipCoherence(orgId, dto.ownership);

	// Si cambian campos condicionales, revalidar V18/V19
	const mergedCtrSubtype = (dto.ctrSubtype ?? existing.ctrSubtype).toUpperCase();
	enforceConditionalFields({...existing, ...dto, ctrSubtype: mergedCtrSubtype} as CreateTrailerDto);

	const fields: Partial<TrailerDocument> = {updatedBy: new ObjectId(actorId)};

	// Campos directos
	if (dto.plates) {
		fields.plates = {
			mx: normalizePlate(dto.plates.mx),
			us: normalizePlate(dto.plates.us),
			usState: dto.plates.usState ? dto.plates.usState.toUpperCase() : null,
		};
	}
	if (dto.ctrSubtype) fields.ctrSubtype = dto.ctrSubtype.toUpperCase();
	if (dto.economicNumber !== undefined)
		fields.economicNumber = dto.economicNumber?.trim() || null;

	if (dto.make !== undefined) fields.make = dto.make.trim();
	if (dto.makeCode !== undefined) fields.makeCode = dto.makeCode;
	if (dto.model !== undefined) fields.model = dto.model?.trim() || null;
	if (dto.modelYear !== undefined) fields.modelYear = dto.modelYear;
	if (dto.manufacturer !== undefined)
		fields.manufacturer = dto.manufacturer?.trim() || null;

	const techSpecKeys = [
		"pbvdKg",
		"taraKg",
		"lengthMeters",
		"widthMeters",
		"heightMeters",
		"axleCount",
		"axleConfiguration",
		"hasLiftAxle",
		"tirePositionCount",
		"suspensionType",
		"suspensionBrand",
		"brakeFrictionType",
		"brakeActuationType",
		"hasABS",
		"slackAdjusterType",
		"kingpinDiameterInches",
		"hasLandingGear",
		"voltageSystem",
		"hasAuxiliaryPowerUnit",
		"wallMaterial",
		"floorMaterial",
		"rearDoorType",
		"hasSideDoor",
		"interiorHeightMeters",
	] as const;
	for (const k of techSpecKeys) {
		if (dto[k] !== undefined) {
			(fields as Record<string, unknown>)[k] = dto[k];
		}
	}

	if (dto.ownership) {
		fields.ownership = await buildOwnershipDocument(dto.ownership, new Date());
	}

	const updated = await updateTrailerFields(orgId, id, fields);
	if (!updated) throw new NotFoundError("Trailer");

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_updated",
		target: {type: "trailer", id, displayName: updated.vin},
		metadata: {fieldsChanged: Object.keys(fields).filter((k) => k !== "updatedBy")},
		context,
	});

	return updated;
}

// ── Cambio de status (máquina de estados) ─────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TrailerStatus, ReadonlySet<TrailerStatus>> = {
	available: new Set([
		"in_maintenance",
		"out_of_service",
		"decommissioned",
		"returned_to_partner",
	]),
	in_maintenance: new Set(["available", "out_of_service"]),
	out_of_service: new Set(["available", "decommissioned"]),
	in_transit: new Set(["available"]),
	decommissioned: new Set(),
	returned_to_partner: new Set(),
};

export async function transitionTrailerStatus(
	orgId: string,
	id: string,
	actorId: string,
	newStatus: TrailerStatus,
	reason: string | null,
	context: AuditContext,
): Promise<Trailer> {
	const existing = await findTrailerById(orgId, id);
	if (!existing) throw new NotFoundError("Trailer");

	if (existing.status === newStatus) return existing;

	const allowed = ALLOWED_TRANSITIONS[existing.status];
	if (!allowed.has(newStatus)) {
		throw new ValidationError(
			`Transición ilegal: ${existing.status} → ${newStatus}`,
		);
	}

	// returned_to_partner solo aplica a remolques en intercambio
	if (newStatus === "returned_to_partner" && existing.ownership.type !== "exchange") {
		throw new ValidationError(
			"Solo remolques en intercambio pueden ser 'returned_to_partner'",
		);
	}

	const updated = await updateTrailerFields(orgId, id, {
		status: newStatus,
		updatedBy: new ObjectId(actorId),
	});
	if (!updated) throw new NotFoundError("Trailer");

	const action =
		newStatus === "decommissioned"
			? "trailer_decommissioned"
			: newStatus === "returned_to_partner"
				? "trailer_returned_to_partner"
				: "trailer_status_changed";

	await emitAuditEvent({
		category: "trailers",
		action,
		target: {type: "trailer", id, displayName: updated.vin},
		diff: {
			status: {old: existing.status, new: newStatus},
		},
		metadata: {reason: reason ?? null},
		context,
	});

	return updated;
}

// ── Decode VIN (NHTSA vPIC) ────────────────────────────────────────────────

/**
 * Valida el VIN localmente y decodifica vía NHTSA. NO persiste — es read-only.
 *
 * Si el VIN tiene formato/checkDigit inválido, lanza ValidationError ANTES de
 * llamar a NHTSA.
 *
 * Si NHTSA falla (timeout, 5xx, payload raro), devuelve `decodeStatus: 'failed'`
 * con `data: null`. NUNCA propaga el error al cliente — la captura manual debe
 * funcionar sin el decoder.
 */
export async function decodeTrailerVin(rawVin: string): Promise<DecodeVinResponse> {
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
		return mapNhtsaResponse(raw, safeVin);
	} catch (err) {
		logger.warn(
			{err, vin: safeVin},
			"NHTSA decode failed — returning decodeStatus='failed'",
		);
		return {decodeStatus: "failed", data: null, rawData: null};
	}
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function deleteTrailer(
	orgId: string,
	id: string,
	context: AuditContext,
): Promise<void> {
	const existing = await findTrailerById(orgId, id);
	if (!existing) throw new NotFoundError("Trailer");

	const ok = await softDeleteTrailer(orgId, id);
	if (!ok) throw new NotFoundError("Trailer");

	logger.info({orgId, trailerId: id}, "Trailer soft-deleted");

	await emitAuditEvent({
		category: "trailers",
		action: "trailer_deleted",
		target: {type: "trailer", id, displayName: existing.vin},
		context,
	});
}

// ── Helpers de validación cruzada ─────────────────────────────────────────

async function assertCtrSubtypeExists(ctrSubtype: string): Promise<void> {
	try {
		const catalog = await getSatCatalog("c_SubTipoRem");
		const found = catalog.data.some(
			(entry) => entry.code.toUpperCase() === ctrSubtype.toUpperCase(),
		);
		if (!found) {
			throw new ValidationError(
				`ctrSubtype "${ctrSubtype}" no existe en el catálogo SAT c_SubTipoRem`,
			);
		}
	} catch (err) {
		// Si el catálogo está caído (sin cache + provider falla) propagamos.
		// Si el subtipo no existe, ValidationError ya está bien.
		if (err instanceof ValidationError) throw err;
		// En degraded mode (catálogo no disponible) bloqueamos para no admitir
		// datos inconsistentes. El operador puede reintentar cuando el catálogo
		// esté caliente.
		throw new ValidationError(
			"No se pudo validar ctrSubtype contra el catálogo SAT en este momento",
		);
	}
}

function enforceConditionalFields(dto: {
	ctrSubtype: string;
	wallMaterial?: unknown;
	floorMaterial?: unknown;
	rearDoorType?: unknown;
	hasSideDoor?: unknown;
	interiorHeightMeters?: unknown;
	kingpinDiameterInches?: unknown;
	hasLandingGear?: unknown;
}): void {
	const ch = getCtrCharacteristic(dto.ctrSubtype.toUpperCase());
	if (!ch) return; // subtipo no en el mapa local — V7 ya validó contra SAT

	// V18: hasEnclosedBody=false → campos de cuerpo deben ser null/undefined
	if (!ch.hasEnclosedBody) {
		const enclosedFields = [
			["wallMaterial", dto.wallMaterial],
			["floorMaterial", dto.floorMaterial],
			["rearDoorType", dto.rearDoorType],
			["hasSideDoor", dto.hasSideDoor],
			["interiorHeightMeters", dto.interiorHeightMeters],
		] as const;
		for (const [name, value] of enclosedFields) {
			if (value !== null && value !== undefined) {
				throw new ValidationError(
					`${name} no aplica para subtipo ${dto.ctrSubtype} (sin caja cerrada)`,
				);
			}
		}
	}

	// V19: isSemiTrailer=false → kingpin/landingGear deben ser null
	if (!ch.isSemiTrailer) {
		if (dto.kingpinDiameterInches !== null && dto.kingpinDiameterInches !== undefined) {
			throw new ValidationError(
				`kingpinDiameterInches no aplica para subtipo ${dto.ctrSubtype} (no es semi-remolque)`,
			);
		}
		if (dto.hasLandingGear !== null && dto.hasLandingGear !== undefined) {
			throw new ValidationError(
				`hasLandingGear no aplica para subtipo ${dto.ctrSubtype} (no es semi-remolque)`,
			);
		}
	}
}

async function assertOwnershipCoherence(
	orgId: string,
	ownership: TrailerOwnershipInput,
): Promise<void> {
	if (ownership.type === "owned") {
		// V10
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

	// V11: NO owned → businessPartnerId requerido
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

	// V12: exchange → role 'trailer_exchange_partner' (estricto)
	if (ownership.type === "exchange") {
		if (!partner.roles.includes("trailer_exchange_partner")) {
			throw new ValidationError(
				"El socio comercial debe tener el rol 'trailer_exchange_partner'",
			);
		}
	}

	// V13: leased_*/commodatum → role 'lessor' (warning, no bloquea)
	// Implementación: NO lo bloqueamos en el service; el frontend muestra el
	// warning y, si aplica, agrega el rol al partner. Aquí no fallamos para
	// permitir el flujo "asignar partner sin role todavía".
}

async function buildOwnershipDocument(
	input: TrailerOwnershipInput,
	now: Date,
): Promise<TrailerOwnershipDocument> {
	const contract: TrailerContractDocument | null = input.contract
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

/**
 * VIN placeholder cuando un quick-register no recibe VIN (a veces el operador
 * no puede leerlo en el momento). Formato: `QR-` + las primeras letras útiles
 * de las placas + timestamp corto. Sirve para satisfacer el índice unique;
 * se actualizará cuando se complete la captura.
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
	// VIN debe ser 17 chars sin I/O/Q
	const cleaned = raw.replace(/[IOQ]/g, "X");
	return cleaned.padEnd(17, "0").slice(0, 17);
}
