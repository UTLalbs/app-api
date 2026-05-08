import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "../../shared/errors/AppError";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {validateRfc as validateRfcViaSat} from "../sat/sat.service";
import {existsTrailerForBusinessPartner} from "../trailers/trailers.repository";

import {
	findBusinessPartnerById,
	findBusinessPartnerByForeignTaxId,
	findBusinessPartnerByRfc,
	findBusinessPartners,
	insertBusinessPartner,
	softDeleteBusinessPartner,
	updateBusinessPartnerFields,
} from "./business-partners.repository";
import type {
	BusinessPartner,
	BusinessPartnerDocument,
	BusinessPartnerQueryFilter,
	CreateBusinessPartnerDto,
	UpdateBusinessPartnerDto,
	ValidateBusinessPartnerRfcResult,
} from "./business-partners.types";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function listBusinessPartners(
	orgId: string,
	filter: BusinessPartnerQueryFilter,
): Promise<{partners: BusinessPartner[]; total: number}> {
	return findBusinessPartners(orgId, filter);
}

export async function getBusinessPartner(
	orgId: string,
	id: string,
): Promise<BusinessPartner> {
	const partner = await findBusinessPartnerById(orgId, id);
	if (!partner) throw new NotFoundError("BusinessPartner");
	return partner;
}

// ── Crear ──────────────────────────────────────────────────────────────────

export async function createBusinessPartner(
	orgId: string,
	actorId: string,
	dto: CreateBusinessPartnerDto,
	context: AuditContext,
): Promise<BusinessPartner> {
	validateFiscalShape(dto);

	const normalized = normalizeFiscal(dto);

	// Check de unicidad temprano (también está el índice partial unique).
	if (normalized.rfc) {
		const dup = await findBusinessPartnerByRfc(orgId, normalized.rfc);
		if (dup) {
			throw new ConflictError(
				`Ya existe un partner con RFC ${normalized.rfc} en esta organización`,
			);
		}
	}
	if (normalized.foreignTaxId) {
		const dup = await findBusinessPartnerByForeignTaxId(
			orgId,
			normalized.foreignTaxId,
		);
		if (dup) {
			throw new ConflictError(
				`Ya existe un partner con Tax ID ${normalized.foreignTaxId} en esta organización`,
			);
		}
	}

	const now = new Date();
	const doc: Omit<BusinessPartnerDocument, "_id"> = {
		orgId: new ObjectId(orgId),
		legalName: dto.legalName.trim(),
		commercialName: dto.commercialName?.trim() || null,
		taxRegime: dto.taxRegime,
		rfc: normalized.rfc,
		foreignTaxId: normalized.foreignTaxId,
		foreignTaxCountry: normalized.foreignTaxCountry,
		rfcValidatedAt: null,
		rfcValidatedStatus: null,
		address: dto.address ?? null,
		contacts: dto.contacts,
		roles: dedupeRoles(dto.roles ?? []),
		isActive: true,
		notes: dto.notes?.trim() || null,
		createdBy: new ObjectId(actorId),
		updatedBy: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const created = await insertBusinessPartner(doc);

	logger.info(
		{orgId, partnerId: created.id, legalName: created.legalName},
		"Business partner created",
	);

	await emitAuditEvent({
		category: "business_partners",
		action: "business_partner_created",
		target: {
			type: "business_partner",
			id: created.id,
			displayName: created.legalName,
		},
		metadata: {
			rfc: created.rfc,
			foreignTaxId: created.foreignTaxId,
			roles: created.roles,
		},
		context,
	});

	return created;
}

// ── Actualizar ─────────────────────────────────────────────────────────────

export async function updateBusinessPartner(
	orgId: string,
	id: string,
	actorId: string,
	dto: UpdateBusinessPartnerDto,
	context: AuditContext,
): Promise<BusinessPartner> {
	const existing = await findBusinessPartnerById(orgId, id);
	if (!existing) throw new NotFoundError("BusinessPartner");

	// Si cambia taxRegime, validar que los campos correspondientes sean coherentes
	const merged = {
		taxRegime: dto.taxRegime ?? existing.taxRegime,
		rfc: dto.rfc !== undefined ? dto.rfc : existing.rfc,
		foreignTaxId:
			dto.foreignTaxId !== undefined ? dto.foreignTaxId : existing.foreignTaxId,
		foreignTaxCountry:
			dto.foreignTaxCountry !== undefined
				? dto.foreignTaxCountry
				: existing.foreignTaxCountry,
	};
	validateFiscalShape({
		taxRegime: merged.taxRegime,
		rfc: merged.rfc,
		foreignTaxId: merged.foreignTaxId,
		foreignTaxCountry: merged.foreignTaxCountry,
	} as CreateBusinessPartnerDto);

	const normalized = normalizeFiscal(merged as CreateBusinessPartnerDto);

	// Unicidad si cambió el rfc/foreignTaxId
	if (normalized.rfc && normalized.rfc !== existing.rfc) {
		const dup = await findBusinessPartnerByRfc(orgId, normalized.rfc);
		if (dup && dup.id !== id) {
			throw new ConflictError(
				`Ya existe un partner con RFC ${normalized.rfc} en esta organización`,
			);
		}
	}
	if (normalized.foreignTaxId && normalized.foreignTaxId !== existing.foreignTaxId) {
		const dup = await findBusinessPartnerByForeignTaxId(
			orgId,
			normalized.foreignTaxId,
		);
		if (dup && dup.id !== id) {
			throw new ConflictError(
				`Ya existe un partner con Tax ID ${normalized.foreignTaxId} en esta organización`,
			);
		}
	}

	const fields: Partial<BusinessPartnerDocument> = {
		updatedBy: new ObjectId(actorId),
	};

	if (dto.legalName !== undefined) fields.legalName = dto.legalName.trim();
	if (dto.commercialName !== undefined)
		fields.commercialName = dto.commercialName?.trim() || null;
	if (dto.taxRegime !== undefined) fields.taxRegime = dto.taxRegime;
	if (
		dto.rfc !== undefined ||
		dto.taxRegime !== undefined ||
		dto.foreignTaxId !== undefined
	) {
		fields.rfc = normalized.rfc;
		fields.foreignTaxId = normalized.foreignTaxId;
		fields.foreignTaxCountry = normalized.foreignTaxCountry;
		// Si cambió rfc/foreignTaxId, invalidamos validación previa
		if (normalized.rfc !== existing.rfc || normalized.foreignTaxId !== existing.foreignTaxId) {
			fields.rfcValidatedAt = null;
			fields.rfcValidatedStatus = null;
		}
	}
	if (dto.address !== undefined) fields.address = dto.address;
	if (dto.contacts !== undefined) fields.contacts = dto.contacts;
	if (dto.roles !== undefined) fields.roles = dedupeRoles(dto.roles);
	if (dto.isActive !== undefined) fields.isActive = dto.isActive;
	if (dto.notes !== undefined) fields.notes = dto.notes?.trim() || null;

	const updated = await updateBusinessPartnerFields(orgId, id, fields);
	if (!updated) throw new NotFoundError("BusinessPartner");

	logger.info({orgId, partnerId: id}, "Business partner updated");

	const auditAction =
		dto.isActive === false && existing.isActive
			? "business_partner_deactivated"
			: "business_partner_updated";

	await emitAuditEvent({
		category: "business_partners",
		action: auditAction,
		target: {
			type: "business_partner",
			id,
			displayName: updated.legalName,
		},
		metadata: {
			fieldsChanged: Object.keys(fields).filter((k) => k !== "updatedBy"),
		},
		context,
	});

	// Auditoría granular de roles agregados/quitados
	if (dto.roles !== undefined) {
		const oldRoles = new Set(existing.roles);
		const newRoles = new Set(updated.roles);
		for (const role of newRoles) {
			if (!oldRoles.has(role)) {
				await emitAuditEvent({
					category: "business_partners",
					action: "business_partner_role_added",
					target: {
						type: "business_partner",
						id,
						displayName: updated.legalName,
					},
					metadata: {role},
					context,
				});
			}
		}
		for (const role of oldRoles) {
			if (!newRoles.has(role)) {
				await emitAuditEvent({
					category: "business_partners",
					action: "business_partner_role_removed",
					target: {
						type: "business_partner",
						id,
						displayName: updated.legalName,
					},
					metadata: {role},
					context,
				});
			}
		}
	}

	return updated;
}

// ── Soft delete ────────────────────────────────────────────────────────────

export async function deleteBusinessPartner(
	orgId: string,
	id: string,
	context: AuditContext,
): Promise<void> {
	const existing = await findBusinessPartnerById(orgId, id);
	if (!existing) throw new NotFoundError("BusinessPartner");

	// Cascade-block: si hay trailers apuntando a este partner, no se puede borrar.
	const inUse = await existsTrailerForBusinessPartner(orgId, id);
	if (inUse) {
		throw new ValidationError(
			"No se puede dar de baja este socio porque hay remolques que lo referencian. Reasigna esos remolques primero.",
		);
	}

	const ok = await softDeleteBusinessPartner(orgId, id);
	if (!ok) throw new NotFoundError("BusinessPartner");

	logger.info({orgId, partnerId: id}, "Business partner soft-deleted");

	await emitAuditEvent({
		category: "business_partners",
		action: "business_partner_deactivated",
		target: {
			type: "business_partner",
			id,
			displayName: existing.legalName,
		},
		metadata: {softDeleted: true},
		context,
	});
}

// ── Validar RFC contra el SAT ──────────────────────────────────────────────

export async function validateBusinessPartnerRfc(
	orgId: string,
	id: string,
	actorId: string,
): Promise<ValidateBusinessPartnerRfcResult> {
	const partner = await findBusinessPartnerById(orgId, id);
	if (!partner) throw new NotFoundError("BusinessPartner");

	if (partner.taxRegime !== "mexican" || !partner.rfc) {
		throw new ValidationError(
			"Solo se puede validar RFC para partners mexicanos con RFC capturado",
		);
	}
	if (!partner.address?.cp) {
		throw new ValidationError(
			"Se requiere código postal en el domicilio para validar el RFC",
		);
	}

	const result = await validateRfcViaSat({
		rfc: partner.rfc,
		nombreRazonSocial: partner.legalName,
		regimenFiscal: null,
		codigoPostal: partner.address.cp,
	});

	const validatedAt = new Date();
	const status = result.esValido ? "valid" : "invalid";

	await updateBusinessPartnerFields(orgId, id, {
		rfcValidatedAt: validatedAt,
		rfcValidatedStatus: status,
		updatedBy: new ObjectId(actorId),
	});

	return {
		rfcValidatedAt: validatedAt,
		rfcValidatedStatus: status,
		estatus: result.estatus,
		usosCFDIPermitidos: result.usosCFDIPermitidos,
	};
}

// ── Helpers ────────────────────────────────────────────────────────────────

function validateFiscalShape(dto: Pick<
	CreateBusinessPartnerDto,
	"taxRegime" | "rfc" | "foreignTaxId" | "foreignTaxCountry"
>): void {
	if (dto.taxRegime === "mexican") {
		if (!dto.rfc) {
			throw new ValidationError("Partner mexicano requiere RFC");
		}
		if (dto.foreignTaxId || dto.foreignTaxCountry) {
			throw new ValidationError(
				"Partner mexicano no debe tener foreignTaxId ni foreignTaxCountry",
			);
		}
	} else if (dto.taxRegime === "foreign") {
		if (!dto.foreignTaxId) {
			throw new ValidationError("Partner extranjero requiere foreignTaxId");
		}
		if (!dto.foreignTaxCountry) {
			throw new ValidationError("Partner extranjero requiere foreignTaxCountry (ISO 3166-1)");
		}
		if (dto.rfc) {
			throw new ValidationError("Partner extranjero no debe tener RFC");
		}
	}
}

function normalizeFiscal(dto: Pick<
	CreateBusinessPartnerDto,
	"taxRegime" | "rfc" | "foreignTaxId" | "foreignTaxCountry"
>): {
	rfc: string | null;
	foreignTaxId: string | null;
	foreignTaxCountry: string | null;
} {
	if (dto.taxRegime === "mexican") {
		return {
			rfc: dto.rfc ? dto.rfc.toUpperCase().trim() : null,
			foreignTaxId: null,
			foreignTaxCountry: null,
		};
	}
	return {
		rfc: null,
		foreignTaxId: dto.foreignTaxId ? dto.foreignTaxId.trim() : null,
		foreignTaxCountry: dto.foreignTaxCountry
			? dto.foreignTaxCountry.toUpperCase().trim()
			: null,
	};
}

function dedupeRoles<T extends string>(roles: T[]): T[] {
	return Array.from(new Set(roles));
}
