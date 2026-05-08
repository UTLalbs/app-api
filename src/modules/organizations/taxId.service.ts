import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {cacheDel, CacheKeys} from "../../infrastructure/cache/cache.service";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "../../shared/errors/AppError";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {validateRfc as validateRfcViaSat} from "../sat/sat.service";
import {existsTrailerForTaxId} from "../trailers/trailers.repository";

import type {
	OrganizationTaxId,
	OrganizationTaxIdDocument,
} from "./organization.types";
import type {
	CreateTaxIdDto,
	UpdateTaxIdDto,
	ValidateTaxIdRfcResult,
} from "./taxId.types";
import {
	ensureFiscalDataShape,
	findTaxId,
	findTaxIdByRfc,
	listTaxIds,
	pushTaxId,
	setDefaultTaxId as setDefaultTaxIdRepo,
	updateTaxIdFields,
} from "./taxId.repository";

// ── Lectura ────────────────────────────────────────────────────────────────

export async function getTaxIds(
	orgId: string,
): Promise<OrganizationTaxId[]> {
	return listTaxIds(orgId);
}

export async function getTaxId(
	orgId: string,
	taxIdId: string,
): Promise<OrganizationTaxId> {
	const taxId = await findTaxId(orgId, taxIdId);
	if (!taxId) throw new NotFoundError("TaxId");
	return taxId;
}

// ── Crear ──────────────────────────────────────────────────────────────────

export async function addTaxId(
	orgId: string,
	dto: CreateTaxIdDto,
	context: AuditContext,
): Promise<OrganizationTaxId> {
	const normalizedRfc = dto.rfc.toUpperCase().trim();

	// 1. Garantizar shape antes de buscar duplicados
	await ensureFiscalDataShape(orgId);

	// 2. Validar RFC único dentro del org (no hay índice — Mongo no soporta
	//    unique en subdoc array; check en service layer es la mitigación).
	const existing = await findTaxIdByRfc(orgId, normalizedRfc);
	if (existing) {
		throw new ConflictError(
			`El RFC ${normalizedRfc} ya está registrado en esta organización`,
		);
	}

	// 3. Determinar isDefault: si es el primero, forzar true; si no, respetar el
	//    flag entrante (false por defecto).
	const currentTaxIds = await listTaxIds(orgId);
	const isFirst = currentTaxIds.length === 0;
	const isDefault = isFirst ? true : Boolean(dto.isDefault);

	const now = new Date();
	const subdoc: OrganizationTaxIdDocument = {
		_id: new ObjectId(),
		rfc: normalizedRfc,
		razonSocial: dto.razonSocial.trim(),
		regimenFiscal: dto.regimenFiscal,
		address: dto.address ?? null,
		isDefault,
		isActive: true,
		rfcValidatedAt: null,
		rfcValidatedStatus: null,
		createdAt: now,
		updatedAt: now,
	};

	// 4. Si entra como default, primero quitar default a los demás
	if (isDefault && !isFirst) {
		await setDefaultTaxIdRepo(orgId, subdoc._id.toHexString()).catch(() => {
			// Si falla porque el subdoc aún no existe, lo arreglamos después de push
		});
	}

	const created = await pushTaxId(orgId, subdoc);

	// 5. Si entró como default tras existir otros, asegurar que solo este queda
	if (isDefault && !isFirst) {
		await setDefaultTaxIdRepo(orgId, created.id);
	}

	await invalidateOrgCache(orgId);

	logger.info({orgId, taxIdId: created.id, rfc: created.rfc}, "TaxId added");

	await emitAuditEvent({
		category: "organizations",
		action: "tax_id_added",
		target: {type: "organization", id: orgId},
		metadata: {taxIdId: created.id, rfc: created.rfc},
		context,
	});

	return created;
}

// ── Actualizar ─────────────────────────────────────────────────────────────

export async function updateTaxId(
	orgId: string,
	taxIdId: string,
	dto: UpdateTaxIdDto,
	context: AuditContext,
): Promise<OrganizationTaxId> {
	const existing = await findTaxId(orgId, taxIdId);
	if (!existing) throw new NotFoundError("TaxId");

	const fields: Partial<OrganizationTaxIdDocument> = {};

	if (dto.rfc !== undefined) {
		const normalizedRfc = dto.rfc.toUpperCase().trim();
		if (normalizedRfc !== existing.rfc) {
			const dup = await findTaxIdByRfc(orgId, normalizedRfc);
			if (dup && dup.id !== taxIdId) {
				throw new ConflictError(
					`El RFC ${normalizedRfc} ya está registrado en esta organización`,
				);
			}
			// Cambiar RFC invalida la validación previa
			fields.rfc = normalizedRfc;
			fields.rfcValidatedAt = null;
			fields.rfcValidatedStatus = null;
		}
	}

	if (dto.razonSocial !== undefined) fields.razonSocial = dto.razonSocial.trim();
	if (dto.regimenFiscal !== undefined) fields.regimenFiscal = dto.regimenFiscal;
	if (dto.address !== undefined) fields.address = dto.address;

	if (Object.keys(fields).length > 0) {
		await updateTaxIdFields(orgId, taxIdId, fields);
		await invalidateOrgCache(orgId);
	}

	const updated = await findTaxId(orgId, taxIdId);
	if (!updated) throw new NotFoundError("TaxId");

	logger.info({orgId, taxIdId}, "TaxId updated");

	await emitAuditEvent({
		category: "organizations",
		action: "tax_id_updated",
		target: {type: "organization", id: orgId},
		metadata: {taxIdId, fieldsChanged: Object.keys(fields)},
		context,
	});

	return updated;
}

// ── Set default ────────────────────────────────────────────────────────────

export async function setDefaultTaxId(
	orgId: string,
	taxIdId: string,
	context: AuditContext,
): Promise<OrganizationTaxId> {
	const existing = await findTaxId(orgId, taxIdId);
	if (!existing) throw new NotFoundError("TaxId");
	if (!existing.isActive) {
		throw new ValidationError(
			"No se puede marcar como predeterminado un RFC inactivo",
		);
	}

	await setDefaultTaxIdRepo(orgId, taxIdId);
	await invalidateOrgCache(orgId);

	logger.info({orgId, taxIdId}, "TaxId default set");

	await emitAuditEvent({
		category: "organizations",
		action: "tax_id_default_set",
		target: {type: "organization", id: orgId},
		metadata: {taxIdId, rfc: existing.rfc},
		context,
	});

	const updated = await findTaxId(orgId, taxIdId);
	if (!updated) throw new NotFoundError("TaxId");
	return updated;
}

// ── Disable (soft) ─────────────────────────────────────────────────────────

export async function disableTaxId(
	orgId: string,
	taxIdId: string,
	context: AuditContext,
): Promise<OrganizationTaxId> {
	const existing = await findTaxId(orgId, taxIdId);
	if (!existing) throw new NotFoundError("TaxId");
	if (!existing.isActive) return existing;

	const all = await listTaxIds(orgId);
	const activeCount = all.filter((t) => t.isActive).length;
	if (activeCount <= 1) {
		throw new ValidationError(
			"No se puede desactivar el único RFC activo de la organización",
		);
	}

	// Cascade-block: si hay trailers apuntando a este taxId, no se puede desactivar.
	const inUse = await existsTrailerForTaxId(orgId, taxIdId);
	if (inUse) {
		throw new ValidationError(
			"No se puede desactivar este RFC porque hay remolques que lo referencian. Reasigna esos remolques a otro RFC primero.",
		);
	}

	await updateTaxIdFields(orgId, taxIdId, {
		isActive: false,
		isDefault: false,
	});

	// Si era el default, reasignar a otro activo (el más reciente)
	if (existing.isDefault) {
		const remainingActive = all.filter(
			(t) => t.id !== taxIdId && t.isActive,
		);
		if (remainingActive.length > 0) {
			const newDefault = remainingActive[0]!;
			await setDefaultTaxIdRepo(orgId, newDefault.id);
		}
	}

	await invalidateOrgCache(orgId);

	logger.info({orgId, taxIdId}, "TaxId disabled");

	await emitAuditEvent({
		category: "organizations",
		action: "tax_id_disabled",
		target: {type: "organization", id: orgId},
		metadata: {taxIdId, rfc: existing.rfc},
		context,
	});

	const updated = await findTaxId(orgId, taxIdId);
	if (!updated) throw new NotFoundError("TaxId");
	return updated;
}

// ── Validar RFC contra el SAT (vía SatProvider) ───────────────────────────

export async function validateTaxIdRfc(
	orgId: string,
	taxIdId: string,
): Promise<ValidateTaxIdRfcResult> {
	const taxId = await findTaxId(orgId, taxIdId);
	if (!taxId) throw new NotFoundError("TaxId");
	if (!taxId.address?.cp) {
		throw new ValidationError(
			"El RFC requiere un código postal en su domicilio para ser validado",
		);
	}

	const result = await validateRfcViaSat({
		rfc: taxId.rfc,
		nombreRazonSocial: taxId.razonSocial,
		regimenFiscal: taxId.regimenFiscal?.code ?? null,
		codigoPostal: taxId.address.cp,
	});

	const validatedAt = new Date();
	const status = result.esValido ? "valid" : "invalid";

	await updateTaxIdFields(orgId, taxIdId, {
		rfcValidatedAt: validatedAt,
		rfcValidatedStatus: status,
	});

	await invalidateOrgCache(orgId);

	return {
		rfcValidatedAt: validatedAt,
		rfcValidatedStatus: status,
		estatus: result.estatus,
		usosCFDIPermitidos: result.usosCFDIPermitidos,
	};
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function invalidateOrgCache(orgId: string): Promise<void> {
	await Promise.all([
		cacheDel(CacheKeys.orgOne(orgId)),
		cacheDel(CacheKeys.orgList()),
	]);
}
