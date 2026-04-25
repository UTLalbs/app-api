import {ObjectId} from "mongodb";

import {getLocationCollection} from "./location.model";
import type {
	CreateLocationDto,
	Location,
	LocationDocument,
	LocationQueryFilter,
	UpdateLocationDto,
} from "./location.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toLocation(doc: LocationDocument): Location {
	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId.toHexString(),
		name: doc.name,
		description: doc.description,
		tags: doc.tags,
		location: doc.location,
		geofence: doc.geofence,
		isFiscal: doc.isFiscal,
		fiscal: doc.fiscal,
		address: doc.address,
		idOrigenDestino: doc.idOrigenDestino,
		clientId: doc.clientId ? doc.clientId.toHexString() : null,
		contact: doc.contact,
		operatingHours: doc.operatingHours,
		accessHours: doc.accessHours,
		isActive: doc.isActive,
		isSystem: doc.isSystem,
		createdBy: doc.createdBy.toHexString(),
		updatedBy: doc.updatedBy ? doc.updatedBy.toHexString() : null,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
		llmSummary: doc.llmSummary,
		humanReadableId: doc.humanReadableId,
		denormalizedRefs: doc.denormalizedRefs,
	};
}

// ── Listar ────────────────────────────────────────────────────────────────

export async function findLocations(
	orgId: string,
	filter: LocationQueryFilter,
): Promise<{locations: Location[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
	};

	if (filter.isActive !== undefined) query.isActive = filter.isActive;
	if (filter.isFiscal !== undefined) query.isFiscal = filter.isFiscal;
	if (filter.country) query["address.country.code"] = filter.country;
	if (filter.tag) query.tags = filter.tag;
	if (filter.clientId && ObjectId.isValid(filter.clientId)) {
		query.clientId = new ObjectId(filter.clientId);
	}
	if (filter.search) {
		query.$or = [
			{name: {$regex: filter.search, $options: "i"}},
			{description: {$regex: filter.search, $options: "i"}},
			{tags: {$regex: filter.search, $options: "i"}},
		];
	}

	const limit = filter.limit ?? 20;
	const page = filter.page ?? 1;
	const skip = (page - 1) * limit;

	const [docs, total] = await Promise.all([
		getLocationCollection()
			.find(query)
			.sort({createdAt: -1})
			.skip(skip)
			.limit(limit)
			.toArray(),
		getLocationCollection().countDocuments(query),
	]);

	return {
		locations: docs.map((doc) => toLocation(doc as LocationDocument)),
		total,
	};
}

// ── Buscar por ID ──────────────────────────────────────────────────────────

export async function findLocationById(
	id: string,
	orgId: string,
): Promise<Location | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getLocationCollection().findOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
		deletedAt: null,
	});

	return doc ? toLocation(doc as LocationDocument) : null;
}

// ── Buscar por idOrigenDestino ────────────────────────────────────────────

export async function findLocationByIdOrigenDestino(
	orgId: string,
	idOrigenDestino: string,
): Promise<Location | null> {
	const doc = await getLocationCollection().findOne({
		orgId: new ObjectId(orgId),
		idOrigenDestino,
		deletedAt: null,
	});

	return doc ? toLocation(doc as LocationDocument) : null;
}

// ── Próximo idOrigenDestino (helper para service) ─────────────────────────

export async function findLastIdOrigenDestino(
	orgId: string,
): Promise<string | null> {
	const doc = await getLocationCollection().findOne(
		{
			orgId: new ObjectId(orgId),
			idOrigenDestino: {$exists: true, $ne: null},
		},
		{
			sort: {idOrigenDestino: -1},
			projection: {idOrigenDestino: 1},
		},
	);
	return doc?.idOrigenDestino ?? null;
}

// ── Búsqueda geoespacial (cercanas) ───────────────────────────────────────

export async function findLocationsNearby(
	orgId: string,
	lat: number,
	lng: number,
	radiusMeters: number,
	limit = 50,
): Promise<Location[]> {
	const docs = await getLocationCollection()
		.find({
			orgId: new ObjectId(orgId),
			deletedAt: null,
			isActive: true,
			location: {
				$nearSphere: {
					$geometry: {type: "Point", coordinates: [lng, lat]},
					$maxDistance: radiusMeters,
				},
			},
		})
		.limit(limit)
		.toArray();

	return docs.map((doc) => toLocation(doc as LocationDocument));
}

// ── Autocomplete (text search top N) ──────────────────────────────────────

export async function autocompleteLocations(
	orgId: string,
	q: string,
	limit = 10,
): Promise<Location[]> {
	if (!q.trim()) return [];

	const docs = await getLocationCollection()
		.find({
			orgId: new ObjectId(orgId),
			deletedAt: null,
			isActive: true,
			$or: [
				{name: {$regex: q, $options: "i"}},
				{description: {$regex: q, $options: "i"}},
			],
		})
		.limit(limit)
		.toArray();

	return docs.map((doc) => toLocation(doc as LocationDocument));
}

// ── Crear ─────────────────────────────────────────────────────────────────

export interface CreateLocationInternal extends CreateLocationDto {
	orgId: string;
	createdBy: string;
	createdByName: string;
	clientName?: string | null;
	idOrigenDestino?: string | null;
}

export async function createLocation(
	dto: CreateLocationInternal,
): Promise<Location> {
	const now = new Date();

	const doc: Omit<LocationDocument, "_id"> = {
		orgId: new ObjectId(dto.orgId),
		name: dto.name,
		description: dto.description ?? null,
		tags: dto.tags ?? [],
		location: dto.location,
		geofence: dto.geofence,
		isFiscal: dto.isFiscal,
		fiscal: dto.fiscal ?? null,
		address: dto.address ?? null,
		idOrigenDestino: dto.idOrigenDestino ?? null,
		clientId:
			dto.clientId && ObjectId.isValid(dto.clientId)
				? new ObjectId(dto.clientId)
				: null,
		contact: dto.contact ?? null,
		operatingHours: dto.operatingHours ?? null,
		accessHours: dto.accessHours ?? null,
		isActive: true,
		isSystem: false,
		createdBy: new ObjectId(dto.createdBy),
		updatedBy: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		llmSummary: null,
		llmSummaryUpdatedAt: null,
		humanReadableId: null,
		contentText: null,
		contentTextHash: null,
		embedding: null,
		embeddingHash: null,
		embeddingModel: null,
		embeddingGeneratedAt: null,
		denormalizedRefs: {
			clientName: dto.clientName ?? null,
			createdByName: dto.createdByName,
		},
	};

	const result = await getLocationCollection().insertOne(
		doc as LocationDocument,
	);

	return toLocation({_id: result.insertedId, ...doc} as LocationDocument);
}

// ── Actualizar ────────────────────────────────────────────────────────────

export interface UpdateLocationInternal extends UpdateLocationDto {
	updatedBy: string;
	clientName?: string | null;
}

export async function updateLocation(
	id: string,
	orgId: string,
	dto: UpdateLocationInternal,
): Promise<Location | null> {
	if (!ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {
		updatedAt: new Date(),
		updatedBy: new ObjectId(dto.updatedBy),
	};

	if (dto.name !== undefined) setFields.name = dto.name;
	if (dto.description !== undefined) setFields.description = dto.description;
	if (dto.tags !== undefined) setFields.tags = dto.tags;
	if (dto.location !== undefined) setFields.location = dto.location;
	if (dto.geofence !== undefined) setFields.geofence = dto.geofence;
	if (dto.isFiscal !== undefined) setFields.isFiscal = dto.isFiscal;
	if (dto.fiscal !== undefined) setFields.fiscal = dto.fiscal;
	if (dto.address !== undefined) setFields.address = dto.address;
	if (dto.contact !== undefined) setFields.contact = dto.contact;
	if (dto.operatingHours !== undefined)
		setFields.operatingHours = dto.operatingHours;
	if (dto.accessHours !== undefined) setFields.accessHours = dto.accessHours;
	if (dto.isActive !== undefined) setFields.isActive = dto.isActive;
	if (dto.clientId !== undefined) {
		setFields.clientId =
			dto.clientId && ObjectId.isValid(dto.clientId)
				? new ObjectId(dto.clientId)
				: null;
	}
	if (dto.clientName !== undefined) {
		setFields["denormalizedRefs.clientName"] = dto.clientName;
	}

	const result = await getLocationCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{$set: setFields},
		{returnDocument: "after"},
	);

	return result ? toLocation(result as LocationDocument) : null;
}

// ── Persistir resultado de validación fiscal (parcial) ────────────────────

export async function persistFiscalValidation(
	id: string,
	orgId: string,
	fields: {
		rfcValidatedAt: Date;
		rfcValidatedStatus: "valid" | "invalid" | "pending";
		validationSource: "facturoporti" | "manual";
		validationNotes: string | null;
	},
): Promise<Location | null> {
	if (!ObjectId.isValid(id)) return null;

	const result = await getLocationCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{
			$set: {
				"fiscal.rfcValidatedAt": fields.rfcValidatedAt,
				"fiscal.rfcValidatedStatus": fields.rfcValidatedStatus,
				"fiscal.validationSource": fields.validationSource,
				"fiscal.validationNotes": fields.validationNotes,
				updatedAt: new Date(),
			},
		},
		{returnDocument: "after"},
	);

	return result ? toLocation(result as LocationDocument) : null;
}

// ── Soft delete ──────────────────────────────────────────────────────────

export async function softDeleteLocation(
	id: string,
	orgId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;

	const result = await getLocationCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{$set: {deletedAt: new Date(), isActive: false, updatedAt: new Date()}},
	);

	return result.modifiedCount > 0;
}
