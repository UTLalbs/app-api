import {ObjectId} from "mongodb";

import {ConflictError} from "../../shared/errors/AppError";

import {getUnitCollection} from "./units.model";
import type {
	Unit,
	UnitDocument,
	UnitOwnership,
	UnitPhotoDocument,
	UnitPhotoView,
	UnitPhotos,
	UnitPhotosDocument,
	UnitQueryFilter,
} from "./units.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toOwnership(doc: UnitDocument["ownership"]): UnitOwnership {
	return {
		type: doc.type,
		internalTaxIdId: doc.internalTaxIdId ? doc.internalTaxIdId.toHexString() : null,
		businessPartnerId: doc.businessPartnerId
			? doc.businessPartnerId.toHexString()
			: null,
		contract: doc.contract,
	};
}

function toPhoto(p: UnitPhotoDocument | null): UnitPhotoView | null {
	if (!p) return null;
	return {
		fileUrl: p.fileUrl,
		fileSize: p.fileSize,
		mimeType: p.mimeType,
		uploadedAt: p.uploadedAt,
		uploadedBy: p.uploadedBy.toHexString(),
	};
}

function toPhotos(doc: UnitPhotosDocument | undefined | null): UnitPhotos {
	const empty: UnitPhotos = {leftSide: null, rightSide: null, front: null, rear: null};
	if (!doc) return empty;
	return {
		leftSide: toPhoto(doc.leftSide),
		rightSide: toPhoto(doc.rightSide),
		front: toPhoto(doc.front),
		rear: toPhoto(doc.rear),
	};
}

function toUnit(doc: UnitDocument): Unit {
	const {
		_id,
		orgId,
		createdBy,
		updatedBy,
		ownership,
		documents: _docs,
		currentOperatorId,
		activePolicyId,
		photos,
		...rest
	} = doc;
	void _docs;
	return {
		...rest,
		id: _id.toHexString(),
		orgId: orgId.toHexString(),
		createdBy: createdBy.toHexString(),
		updatedBy: updatedBy.toHexString(),
		ownership: toOwnership(ownership),
		currentOperatorId: currentOperatorId ? currentOperatorId.toHexString() : null,
		activePolicyId: activePolicyId ? activePolicyId.toHexString() : null,
		photos: toPhotos(photos),
	};
}

// ── Listar ─────────────────────────────────────────────────────────────────

export async function findUnits(
	orgId: string,
	filter: UnitQueryFilter,
): Promise<{units: Unit[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
	};

	if (filter.status) query.status = filter.status;
	if (filter.satConfigCode) query.satConfigCode = filter.satConfigCode.toUpperCase();
	if (filter.ownershipType) query["ownership.type"] = filter.ownershipType;
	if (filter.fuelType) query.fuelType = filter.fuelType;
	if (filter.hasOperator !== undefined) {
		query.currentOperatorId = filter.hasOperator ? {$ne: null} : null;
	}
	if (filter.search) {
		const rx = {$regex: filter.search, $options: "i"};
		query.$or = [
			{vin: rx},
			{economicNumber: rx},
			{"plates.mx": rx},
			{"plates.us": rx},
			{make: rx},
			{model: rx},
		];
	}

	const limit = Math.min(filter.limit ?? 20, 100);
	const page = filter.page ?? 1;
	const skip = (page - 1) * limit;

	const sortDir = filter.sortDirection === "desc" ? -1 : 1;
	const sortSpec: Record<string, 1 | -1> = filter.sortField
		? {[filter.sortField]: sortDir}
		: {economicNumber: 1};

	const [docs, total] = await Promise.all([
		getUnitCollection()
			.find(query)
			.sort(sortSpec)
			.skip(skip)
			.limit(limit)
			.toArray(),
		getUnitCollection().countDocuments(query),
	]);

	return {
		units: docs.map(toUnit),
		total,
	};
}

// ── Búsquedas por unique ──────────────────────────────────────────────────

export async function findUnitById(orgId: string, id: string): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const doc = await getUnitCollection().findOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
		deletedAt: null,
	});

	return doc ? toUnit(doc as UnitDocument) : null;
}

export async function findUnitByVin(orgId: string, vin: string): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getUnitCollection().findOne({
		orgId: new ObjectId(orgId),
		vin: vin.toUpperCase(),
		deletedAt: null,
	});

	return doc ? toUnit(doc as UnitDocument) : null;
}

export async function findUnitByPlate(
	orgId: string,
	side: "mx" | "us",
	plate: string,
): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getUnitCollection().findOne({
		orgId: new ObjectId(orgId),
		[`plates.${side}`]: plate,
		deletedAt: null,
	});

	return doc ? toUnit(doc as UnitDocument) : null;
}

export async function findUnitByEconomicNumber(
	orgId: string,
	economicNumber: string,
): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getUnitCollection().findOne({
		orgId: new ObjectId(orgId),
		economicNumber,
		deletedAt: null,
	});

	return doc ? toUnit(doc as UnitDocument) : null;
}

/** Devuelve la unidad asignada activamente al operador, si existe. */
export async function findUnitByCurrentOperator(
	orgId: string,
	operatorEmployeeId: string,
): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(operatorEmployeeId)) {
		return null;
	}

	const doc = await getUnitCollection().findOne({
		orgId: new ObjectId(orgId),
		currentOperatorId: new ObjectId(operatorEmployeeId),
		deletedAt: null,
	});

	return doc ? toUnit(doc as UnitDocument) : null;
}

/** Devuelve true si alguna unidad apunta al taxId dado. Usado para cascade-block. */
export async function existsUnitForTaxId(
	orgId: string,
	taxIdId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(taxIdId)) return false;

	const count = await getUnitCollection().countDocuments(
		{
			orgId: new ObjectId(orgId),
			"ownership.internalTaxIdId": new ObjectId(taxIdId),
			deletedAt: null,
		},
		{limit: 1},
	);

	return count > 0;
}

/** Devuelve true si alguna unidad apunta al business partner dado. */
export async function existsUnitForBusinessPartner(
	orgId: string,
	businessPartnerId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(businessPartnerId)) {
		return false;
	}

	const count = await getUnitCollection().countDocuments(
		{
			orgId: new ObjectId(orgId),
			"ownership.businessPartnerId": new ObjectId(businessPartnerId),
			deletedAt: null,
		},
		{limit: 1},
	);

	return count > 0;
}

// ── Inserción ──────────────────────────────────────────────────────────────

export async function insertUnit(
	doc: Omit<UnitDocument, "_id">,
): Promise<Unit> {
	try {
		const result = await getUnitCollection().insertOne(doc as UnitDocument);
		return toUnit({
			_id: result.insertedId,
			...doc,
		} as UnitDocument);
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw mapDuplicateError(err as {keyPattern?: Record<string, unknown>});
		}
		throw err;
	}
}

// ── Update ─────────────────────────────────────────────────────────────────

export async function updateUnitFields(
	orgId: string,
	id: string,
	fields: Partial<UnitDocument>,
): Promise<Unit | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {
		...fields,
		updatedAt: new Date(),
	};

	try {
		const result = await getUnitCollection().findOneAndUpdate(
			{
				_id: new ObjectId(id),
				orgId: new ObjectId(orgId),
				deletedAt: null,
			},
			{$set: setFields},
			{returnDocument: "after"},
		);

		return result ? toUnit(result as UnitDocument) : null;
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw mapDuplicateError(err as {keyPattern?: Record<string, unknown>});
		}
		throw err;
	}
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function softDeleteUnit(orgId: string, id: string): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return false;

	const result = await getUnitCollection().updateOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{$set: {deletedAt: new Date(), updatedAt: new Date()}},
	);

	return result.matchedCount > 0;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function mapDuplicateError(err: {keyPattern?: Record<string, unknown>}): ConflictError {
	const key = err.keyPattern ? Object.keys(err.keyPattern).join(", ") : "unique";
	if (key.includes("vin")) return new ConflictError("Ya existe una unidad con ese VIN");
	if (key.includes("plates.mx")) {
		return new ConflictError("Ya existe una unidad con esa placa MX");
	}
	if (key.includes("plates.us")) {
		return new ConflictError("Ya existe una unidad con esa placa US");
	}
	if (key.includes("economicNumber")) {
		return new ConflictError("Ya existe una unidad con ese número económico");
	}
	return new ConflictError(`Conflicto de unicidad en la unidad (${key})`);
}
