import {ObjectId} from "mongodb";

import {ConflictError} from "../../shared/errors/AppError";

import {getTrailerCollection} from "./trailers.model";
import type {
	Trailer,
	TrailerDocument,
	TrailerOwnership,
	TrailerQueryFilter,
} from "./trailers.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toOwnership(
	doc: TrailerDocument["ownership"],
): TrailerOwnership {
	return {
		type: doc.type,
		internalTaxIdId: doc.internalTaxIdId ? doc.internalTaxIdId.toHexString() : null,
		businessPartnerId: doc.businessPartnerId
			? doc.businessPartnerId.toHexString()
			: null,
		contract: doc.contract,
	};
}

function toTrailer(doc: TrailerDocument): Trailer {
	// `documents` se omite del dominio Trailer; se accede vía el endpoint
	// dedicado GET /trailers/:trailerId/documents.
	const {_id, orgId, createdBy, updatedBy, ownership, documents: _docs, ...rest} = doc;
	void _docs;
	return {
		...rest,
		id: _id.toHexString(),
		orgId: orgId.toHexString(),
		createdBy: createdBy.toHexString(),
		updatedBy: updatedBy.toHexString(),
		ownership: toOwnership(ownership),
	};
}

// ── Listar ─────────────────────────────────────────────────────────────────

export async function findTrailers(
	orgId: string,
	filter: TrailerQueryFilter,
): Promise<{trailers: Trailer[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
	};

	if (filter.status) query.status = filter.status;
	if (filter.ctrSubtype) query.ctrSubtype = filter.ctrSubtype;
	if (filter.ownershipType) query["ownership.type"] = filter.ownershipType;
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

	// Sort dinámico — si se pide, lo aplica; si no, default por createdAt desc.
	// El validator restringe sortField a valores seguros (no risk de inyección).
	const sortDir = filter.sortDirection === "desc" ? -1 : 1;
	const sortSpec: Record<string, 1 | -1> = filter.sortField
		? {[filter.sortField]: sortDir}
		: {createdAt: -1};

	const [docs, total] = await Promise.all([
		getTrailerCollection()
			.find(query)
			.sort(sortSpec)
			.skip(skip)
			.limit(limit)
			.toArray(),
		getTrailerCollection().countDocuments(query),
	]);

	return {
		trailers: docs.map(toTrailer),
		total,
	};
}

// ── Búsquedas por unique ──────────────────────────────────────────────────

export async function findTrailerById(
	orgId: string,
	id: string,
): Promise<Trailer | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const doc = await getTrailerCollection().findOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
		deletedAt: null,
	});

	return doc ? toTrailer(doc as TrailerDocument) : null;
}

export async function findTrailerByVin(
	orgId: string,
	vin: string,
): Promise<Trailer | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getTrailerCollection().findOne({
		orgId: new ObjectId(orgId),
		vin: vin.toUpperCase(),
		deletedAt: null,
	});

	return doc ? toTrailer(doc as TrailerDocument) : null;
}

export async function findTrailerByPlate(
	orgId: string,
	side: "mx" | "us",
	plate: string,
): Promise<Trailer | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getTrailerCollection().findOne({
		orgId: new ObjectId(orgId),
		[`plates.${side}`]: plate,
		deletedAt: null,
	});

	return doc ? toTrailer(doc as TrailerDocument) : null;
}

export async function findTrailerByEconomicNumber(
	orgId: string,
	economicNumber: string,
): Promise<Trailer | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getTrailerCollection().findOne({
		orgId: new ObjectId(orgId),
		economicNumber,
		deletedAt: null,
	});

	return doc ? toTrailer(doc as TrailerDocument) : null;
}

/** Devuelve true si algún trailer apunta al taxId dado. Usado para cascade-block. */
export async function existsTrailerForTaxId(
	orgId: string,
	taxIdId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(taxIdId)) return false;

	const count = await getTrailerCollection().countDocuments(
		{
			orgId: new ObjectId(orgId),
			"ownership.internalTaxIdId": new ObjectId(taxIdId),
			deletedAt: null,
		},
		{limit: 1},
	);

	return count > 0;
}

/** Devuelve true si algún trailer apunta al business partner dado. */
export async function existsTrailerForBusinessPartner(
	orgId: string,
	businessPartnerId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(businessPartnerId)) {
		return false;
	}

	const count = await getTrailerCollection().countDocuments(
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

export async function insertTrailer(
	doc: Omit<TrailerDocument, "_id">,
): Promise<Trailer> {
	try {
		const result = await getTrailerCollection().insertOne(
			doc as TrailerDocument,
		);
		return toTrailer({
			_id: result.insertedId,
			...doc,
		} as TrailerDocument);
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw mapDuplicateError(err as {keyPattern?: Record<string, unknown>});
		}
		throw err;
	}
}

// ── Update ─────────────────────────────────────────────────────────────────

export async function updateTrailerFields(
	orgId: string,
	id: string,
	fields: Partial<TrailerDocument>,
): Promise<Trailer | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {
		...fields,
		updatedAt: new Date(),
	};

	try {
		const result = await getTrailerCollection().findOneAndUpdate(
			{
				_id: new ObjectId(id),
				orgId: new ObjectId(orgId),
				deletedAt: null,
			},
			{$set: setFields},
			{returnDocument: "after"},
		);

		return result ? toTrailer(result as TrailerDocument) : null;
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw mapDuplicateError(err as {keyPattern?: Record<string, unknown>});
		}
		throw err;
	}
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function softDeleteTrailer(
	orgId: string,
	id: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return false;

	const result = await getTrailerCollection().updateOne(
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
	if (key.includes("vin")) return new ConflictError("Ya existe un remolque con ese VIN");
	if (key.includes("plates.mx")) {
		return new ConflictError("Ya existe un remolque con esa placa MX");
	}
	if (key.includes("plates.us")) {
		return new ConflictError("Ya existe un remolque con esa placa US");
	}
	if (key.includes("economicNumber")) {
		return new ConflictError("Ya existe un remolque con ese número económico");
	}
	return new ConflictError(`Conflicto de unicidad en el remolque (${key})`);
}
