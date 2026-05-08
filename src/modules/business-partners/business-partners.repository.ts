import {ObjectId} from "mongodb";

import {ConflictError} from "../../shared/errors/AppError";

import {getBusinessPartnersCollection} from "./business-partners.model";
import type {
	BusinessPartner,
	BusinessPartnerDocument,
	BusinessPartnerQueryFilter,
} from "./business-partners.types";

// ── Conversión documento → dominio ─────────────────────────────────────────

function toBusinessPartner(doc: BusinessPartnerDocument): BusinessPartner {
	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId.toHexString(),
		legalName: doc.legalName,
		commercialName: doc.commercialName,
		taxRegime: doc.taxRegime,
		rfc: doc.rfc,
		foreignTaxId: doc.foreignTaxId,
		foreignTaxCountry: doc.foreignTaxCountry,
		rfcValidatedAt: doc.rfcValidatedAt,
		rfcValidatedStatus: doc.rfcValidatedStatus,
		address: doc.address,
		contacts: doc.contacts ?? [],
		roles: doc.roles ?? [],
		isActive: doc.isActive,
		notes: doc.notes,
		createdBy: doc.createdBy.toHexString(),
		updatedBy: doc.updatedBy ? doc.updatedBy.toHexString() : null,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

// ── Listar ─────────────────────────────────────────────────────────────────

export async function findBusinessPartners(
	orgId: string,
	filter: BusinessPartnerQueryFilter,
): Promise<{partners: BusinessPartner[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
	};

	if (filter.isActive !== undefined) query.isActive = filter.isActive;
	if (filter.taxRegime) query.taxRegime = filter.taxRegime;
	if (filter.role) query.roles = filter.role;
	if (filter.search) {
		const rx = {$regex: filter.search, $options: "i"};
		query.$or = [
			{legalName: rx},
			{commercialName: rx},
			{rfc: rx},
			{foreignTaxId: rx},
		];
	}

	const limit = Math.min(filter.limit ?? 20, 100);
	const page = filter.page ?? 1;
	const skip = (page - 1) * limit;

	const [docs, total] = await Promise.all([
		getBusinessPartnersCollection()
			.find(query)
			.sort({createdAt: -1})
			.skip(skip)
			.limit(limit)
			.toArray(),
		getBusinessPartnersCollection().countDocuments(query),
	]);

	return {
		partners: docs.map(toBusinessPartner),
		total,
	};
}

// ── Lectura por id ─────────────────────────────────────────────────────────

export async function findBusinessPartnerById(
	orgId: string,
	id: string,
): Promise<BusinessPartner | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(orgId)) return null;

	const doc = await getBusinessPartnersCollection().findOne({
		_id: new ObjectId(id),
		orgId: new ObjectId(orgId),
		deletedAt: null,
	});

	return doc ? toBusinessPartner(doc as BusinessPartnerDocument) : null;
}

export async function findBusinessPartnerByRfc(
	orgId: string,
	rfc: string,
): Promise<BusinessPartner | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getBusinessPartnersCollection().findOne({
		orgId: new ObjectId(orgId),
		rfc: rfc.toUpperCase(),
		deletedAt: null,
	});

	return doc ? toBusinessPartner(doc as BusinessPartnerDocument) : null;
}

export async function findBusinessPartnerByForeignTaxId(
	orgId: string,
	foreignTaxId: string,
): Promise<BusinessPartner | null> {
	if (!ObjectId.isValid(orgId)) return null;

	const doc = await getBusinessPartnersCollection().findOne({
		orgId: new ObjectId(orgId),
		foreignTaxId: foreignTaxId.trim(),
		deletedAt: null,
	});

	return doc ? toBusinessPartner(doc as BusinessPartnerDocument) : null;
}

// ── Inserción ──────────────────────────────────────────────────────────────

export async function insertBusinessPartner(
	doc: Omit<BusinessPartnerDocument, "_id">,
): Promise<BusinessPartner> {
	try {
		const result = await getBusinessPartnersCollection().insertOne(
			doc as BusinessPartnerDocument,
		);
		return toBusinessPartner({
			_id: result.insertedId,
			...doc,
		} as BusinessPartnerDocument);
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw new ConflictError("Ya existe un partner con ese RFC o Tax ID");
		}
		throw err;
	}
}

// ── Update ─────────────────────────────────────────────────────────────────

export async function updateBusinessPartnerFields(
	orgId: string,
	id: string,
	fields: Partial<BusinessPartnerDocument>,
): Promise<BusinessPartner | null> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {
		...fields,
		updatedAt: new Date(),
	};

	try {
		const result = await getBusinessPartnersCollection().findOneAndUpdate(
			{
				_id: new ObjectId(id),
				orgId: new ObjectId(orgId),
				deletedAt: null,
			},
			{$set: setFields},
			{returnDocument: "after"},
		);

		return result ? toBusinessPartner(result as BusinessPartnerDocument) : null;
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw new ConflictError("Ya existe un partner con ese RFC o Tax ID");
		}
		throw err;
	}
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function softDeleteBusinessPartner(
	orgId: string,
	id: string,
): Promise<boolean> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(id)) return false;

	const result = await getBusinessPartnersCollection().updateOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			deletedAt: null,
		},
		{$set: {deletedAt: new Date(), updatedAt: new Date(), isActive: false}},
	);

	return result.matchedCount > 0;
}
