import {ObjectId} from "mongodb";

import {NotFoundError} from "../../shared/errors/AppError";

import {getOrganizationCollection} from "./organization.model";
import type {
	OrganizationDocument,
	OrganizationTaxId,
	OrganizationTaxIdDocument,
} from "./organization.types";

// ── Helpers ────────────────────────────────────────────────────────────────

function toTaxId(doc: OrganizationTaxIdDocument): OrganizationTaxId {
	return {
		id: doc._id.toHexString(),
		rfc: doc.rfc,
		razonSocial: doc.razonSocial,
		regimenFiscal: doc.regimenFiscal,
		address: doc.address,
		isDefault: doc.isDefault,
		isActive: doc.isActive,
		rfcValidatedAt: doc.rfcValidatedAt,
		rfcValidatedStatus: doc.rfcValidatedStatus,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

async function findOrgDoc(orgId: string): Promise<OrganizationDocument> {
	if (!ObjectId.isValid(orgId)) throw new NotFoundError("Organization");
	const doc = await getOrganizationCollection().findOne<OrganizationDocument>({
		_id: new ObjectId(orgId),
		deletedAt: null,
	});
	if (!doc) throw new NotFoundError("Organization");
	return doc;
}

// ── Lecturas ───────────────────────────────────────────────────────────────

export async function listTaxIds(
	orgId: string,
): Promise<OrganizationTaxId[]> {
	const org = await findOrgDoc(orgId);
	return (org.fiscalData?.taxIds ?? []).map(toTaxId);
}

export async function findTaxId(
	orgId: string,
	taxIdId: string,
): Promise<OrganizationTaxId | null> {
	if (!ObjectId.isValid(taxIdId)) return null;
	const org = await findOrgDoc(orgId);
	const subdoc = org.fiscalData?.taxIds?.find(
		(t) => t._id.toHexString() === taxIdId,
	);
	return subdoc ? toTaxId(subdoc) : null;
}

export async function findTaxIdByRfc(
	orgId: string,
	rfc: string,
): Promise<OrganizationTaxId | null> {
	const org = await findOrgDoc(orgId);
	const subdoc = org.fiscalData?.taxIds?.find(
		(t) => t.rfc.toUpperCase() === rfc.toUpperCase(),
	);
	return subdoc ? toTaxId(subdoc) : null;
}

// ── Escrituras ─────────────────────────────────────────────────────────────

export async function pushTaxId(
	orgId: string,
	subdoc: OrganizationTaxIdDocument,
): Promise<OrganizationTaxId> {
	if (!ObjectId.isValid(orgId)) throw new NotFoundError("Organization");
	const result = await getOrganizationCollection().findOneAndUpdate(
		{_id: new ObjectId(orgId), deletedAt: null},
		{
			$push: {"fiscalData.taxIds": subdoc},
			$set: {updatedAt: new Date()},
			$setOnInsert: {},
		},
		{returnDocument: "after"},
	);
	if (!result) throw new NotFoundError("Organization");
	return toTaxId(subdoc);
}

export async function ensureFiscalDataShape(orgId: string): Promise<void> {
	if (!ObjectId.isValid(orgId)) throw new NotFoundError("Organization");
	await getOrganizationCollection().updateOne(
		{
			_id: new ObjectId(orgId),
			deletedAt: null,
			$or: [
				{fiscalData: null},
				{fiscalData: {$exists: false}},
				{"fiscalData.taxIds": {$exists: false}},
			],
		},
		{$set: {fiscalData: {taxIds: []}}},
	);
}

export async function updateTaxIdFields(
	orgId: string,
	taxIdId: string,
	fields: Partial<OrganizationTaxIdDocument>,
): Promise<void> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(taxIdId)) {
		throw new NotFoundError("TaxId");
	}

	const set: Record<string, unknown> = {
		"fiscalData.taxIds.$[el].updatedAt": new Date(),
		updatedAt: new Date(),
	};
	for (const [key, value] of Object.entries(fields)) {
		set[`fiscalData.taxIds.$[el].${key}`] = value;
	}

	const result = await getOrganizationCollection().updateOne(
		{_id: new ObjectId(orgId), deletedAt: null},
		{$set: set},
		{arrayFilters: [{"el._id": new ObjectId(taxIdId)}]},
	);

	if (result.matchedCount === 0) throw new NotFoundError("Organization");
}

/**
 * Atómico: pone `isDefault: false` en todos los taxIds del org y luego
 * `isDefault: true` en el target. Si dos requests concurrentes corren a la
 * vez, el orden de los $set protege contra dejar 2 defaults; el peor caso es
 * dejar 0 defaults momentáneamente, lo cual es aceptable.
 */
export async function setDefaultTaxId(
	orgId: string,
	taxIdId: string,
): Promise<void> {
	if (!ObjectId.isValid(orgId) || !ObjectId.isValid(taxIdId)) {
		throw new NotFoundError("TaxId");
	}

	const collection = getOrganizationCollection();
	const now = new Date();

	await collection.updateOne(
		{_id: new ObjectId(orgId), deletedAt: null},
		{$set: {"fiscalData.taxIds.$[].isDefault": false, updatedAt: now}},
	);

	const result = await collection.updateOne(
		{_id: new ObjectId(orgId), deletedAt: null},
		{
			$set: {
				"fiscalData.taxIds.$[el].isDefault": true,
				"fiscalData.taxIds.$[el].updatedAt": now,
				updatedAt: now,
			},
		},
		{arrayFilters: [{"el._id": new ObjectId(taxIdId), "el.isActive": true}]},
	);

	if (result.modifiedCount === 0) {
		throw new NotFoundError("TaxId activo");
	}
}
