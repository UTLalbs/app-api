import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {ConflictError, NotFoundError} from "../../shared/errors/AppError";

import {getOrganizationCollection} from "./organization.model";
import type {
	CreateOrganizationDto,
	Organization,
	OrganizationDocument,
	OrganizationFiscalData,
	OrganizationFiscalDataDocument,
	OrganizationTaxId,
	OrganizationTaxIdDocument,
	UpdateOrganizationDto,
} from "./organization.types";

// ── Conversiones documento ↔ dominio ──────────────────────────────────────

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

function toFiscalData(
	doc: OrganizationFiscalDataDocument | null | undefined,
): OrganizationFiscalData | null {
	if (!doc) return null;
	return {
		taxIds: (doc.taxIds ?? []).map(toTaxId),
	};
}

function toOrganization(doc: OrganizationDocument): Organization {
	return {
		id: doc._id.toHexString(),
		name: doc.name,
		slug: doc.slug,
		status: doc.status,
		settings: doc.settings,
		fiscalData: toFiscalData(doc.fiscalData),
		contacts: doc.contacts ?? [],
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

// ── Métodos del repository ─────────────────────────────────────────────────

export async function findOrganizationById(
	id: string,
): Promise<Organization | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getOrganizationCollection().findOne<OrganizationDocument>({
		_id: new ObjectId(id),
		deletedAt: null,
	});

	return doc ? toOrganization(doc) : null;
}

export async function findOrganizationBySlug(
	slug: string,
): Promise<Organization | null> {
	const doc = await getOrganizationCollection().findOne<OrganizationDocument>({
		slug: slug.toLowerCase(),
		deletedAt: null,
	});

	return doc ? toOrganization(doc) : null;
}

export async function findAllOrganizations(): Promise<Organization[]> {
	const docs = await getOrganizationCollection()
		.find<OrganizationDocument>({deletedAt: null})
		.toArray();

	return docs.map(toOrganization);
}

export async function createOrganization(
	dto: CreateOrganizationDto & {slug: string},
): Promise<Organization> {
	const now = new Date();

	// Si viene un primer taxId, lo dejamos como `taxIds[0]` con isDefault: true
	let fiscalData: OrganizationFiscalDataDocument | null = null;
	if (dto.initialTaxId) {
		fiscalData = {
			taxIds: [
				{
					_id: new ObjectId(),
					rfc: dto.initialTaxId.rfc.toUpperCase().trim(),
					razonSocial: dto.initialTaxId.razonSocial.trim(),
					regimenFiscal: dto.initialTaxId.regimenFiscal,
					address: dto.initialTaxId.address ?? null,
					isDefault: true,
					isActive: true,
					rfcValidatedAt: null,
					rfcValidatedStatus: null,
					createdAt: now,
					updatedAt: now,
				},
			],
		};
	}

	const doc: Omit<OrganizationDocument, "_id"> = {
		name: dto.name.trim(),
		slug: dto.slug.toLowerCase().trim(),
		status: "active",
		fiscalData,
		contacts: dto.contacts ?? [],
		settings: {
			timezone: "America/Mexico_City",
			distanceUnit: "km",
			weightUnit: "kg",
			dimensionUnit: "m",
			volumeUnit: "m3",
			temperatureUnit: "C",
			currency: ["MXN"],
			gpsUpdateInterval: 30,
			maxUsers: dto.settings?.maxUsers ?? 10,
			allowedEmailDomains: dto.settings?.allowedEmailDomains ?? [],
			features: {
				operations: true,
				fuel: false,
				maintenance: false,
				administration: false,
				humanResources: false,
				payroll: false,
				catalogs: false,
				...dto.settings?.features,
			},
		},
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	try {
		const result = await getOrganizationCollection().insertOne(
			doc as OrganizationDocument,
		);

		logger.info(
			{orgId: result.insertedId.toHexString(), slug: doc.slug},
			"Organization created",
		);

		return toOrganization({
			_id: result.insertedId,
			...doc,
		} as OrganizationDocument);
	} catch (err: unknown) {
		if ((err as {code?: number}).code === 11000) {
			throw new ConflictError(`Slug "${dto.slug}" is already taken`);
		}
		throw err;
	}
}

export async function updateOrganization(
	id: string,
	dto: UpdateOrganizationDto,
): Promise<Organization> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("Organization");

	// Construir $set dinámicamente para no sobreescribir settings completos
	// si solo se actualiza una propiedad de settings
	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	if (dto.name) setFields["name"] = dto.name.trim();
	if (dto.status) setFields["status"] = dto.status;
	if (dto.settings) {
		const s = dto.settings;
		if (s.timezone !== undefined) setFields["settings.timezone"] = s.timezone;
		if (s.distanceUnit !== undefined)
			setFields["settings.distanceUnit"] = s.distanceUnit;
		if (s.weightUnit !== undefined)
			setFields["settings.weightUnit"] = s.weightUnit;
		if (s.dimensionUnit !== undefined)
			setFields["settings.dimensionUnit"] = s.dimensionUnit;
		if (s.volumeUnit !== undefined)
			setFields["settings.volumeUnit"] = s.volumeUnit;
		if (s.temperatureUnit !== undefined)
			setFields["settings.temperatureUnit"] = s.temperatureUnit;
		if (s.currency !== undefined) setFields["settings.currency"] = s.currency;
		if (s.gpsUpdateInterval !== undefined)
			setFields["settings.gpsUpdateInterval"] = s.gpsUpdateInterval;
		if (s.maxUsers !== undefined) setFields["settings.maxUsers"] = s.maxUsers;
		if (s.allowedEmailDomains !== undefined)
			setFields["settings.allowedEmailDomains"] = s.allowedEmailDomains;
		if (s.features !== undefined) setFields["settings.features"] = s.features;
	}
	if (dto.contacts !== undefined) setFields.contacts = dto.contacts;

	const result = await getOrganizationCollection().findOneAndUpdate(
		{_id: new ObjectId(id), deletedAt: null},
		{$set: setFields},
		{returnDocument: "after"},
	);

	if (!result) throw new NotFoundError("Organization");

	return toOrganization(result as OrganizationDocument);
}

export async function softDeleteOrganization(id: string): Promise<void> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("Organization");

	const result = await getOrganizationCollection().updateOne(
		{_id: new ObjectId(id), deletedAt: null},
		{$set: {deletedAt: new Date(), updatedAt: new Date()}},
	);

	if (result.matchedCount === 0) throw new NotFoundError("Organization");

	logger.info({orgId: id}, "Organization soft deleted");
}

// Re-export para uso externo (taxId.repository necesita findOrganizationById)
export {toOrganization};
