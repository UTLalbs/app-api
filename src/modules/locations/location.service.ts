import {logger} from "../../config/logger";
import {ForbiddenError, NotFoundError, ValidationError} from "../../shared/errors/AppError";
import {computeDiff} from "../../shared/utils/diff";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {validateRFC} from "../tax/tax.service";

import {
	autocompleteLocations as autocompleteLocationsRepo,
	createLocation,
	findLastIdOrigenDestino,
	findLocationById,
	findLocationByIdOrigenDestino,
	findLocations,
	findLocationsNearby,
	persistFiscalValidation,
	softDeleteLocation,
	updateLocation,
} from "./location.repository";
import type {
	CheckPointDto,
	CheckPointResult,
	CreateLocationDto,
	Geofence,
	Location,
	LocationQueryFilter,
	NearbyQuery,
	UpdateLocationDto,
	ValidateFiscalDto,
} from "./location.types";

// ── Generador de idOrigenDestino (Carta Porte) ────────────────────────────

async function generateNextIdOrigenDestino(orgId: string): Promise<string> {
	const last = await findLastIdOrigenDestino(orgId);
	const lastNumber = last ? parseInt(last, 10) || 0 : 0;
	return (lastNumber + 1).toString().padStart(6, "0");
}

// ── Validación de geocerca ────────────────────────────────────────────────

function validateGeofence(geofence: Geofence): void {
	if (geofence.type === "circle") {
		if (
			!Number.isFinite(geofence.radiusMeters) ||
			geofence.radiusMeters < 10 ||
			geofence.radiusMeters > 10_000
		) {
			throw new ValidationError(
				"radiusMeters debe estar entre 10 y 10000 metros",
			);
		}
	} else if (geofence.type === "polygon") {
		if (!Array.isArray(geofence.points) || geofence.points.length < 3) {
			throw new ValidationError(
				"Un polígono requiere al menos 3 puntos",
			);
		}
	} else {
		throw new ValidationError("Tipo de geocerca inválido");
	}
}

// ── Validación fiscal-related al crear/editar ─────────────────────────────

interface NormalizedFiscalResult {
	dto: CreateLocationDto;
	idOrigenDestino: string | null;
}

async function normalizeFiscalForCreate(
	orgId: string,
	dto: CreateLocationDto,
): Promise<NormalizedFiscalResult> {
	if (!dto.isFiscal) {
		return {dto: {...dto, fiscal: null, address: dto.address ?? null}, idOrigenDestino: null};
	}

	if (!dto.fiscal) {
		throw new ValidationError("fiscal es requerido cuando isFiscal=true");
	}
	if (!dto.fiscal.razonSocial) {
		throw new ValidationError("fiscal.razonSocial es requerido");
	}
	if (!dto.address) {
		throw new ValidationError("address es requerida en ubicaciones fiscales");
	}
	if (!dto.address.country?.code) {
		throw new ValidationError("address.country es requerido");
	}

	const countryCode = dto.address.country.code;
	const fiscal = {...dto.fiscal};

	if (countryCode === "MEX") {
		if (!fiscal.rfc) {
			throw new ValidationError("fiscal.rfc es requerido para ubicaciones en México");
		}
	} else {
		// Extranjero: RFC genérico, taxId obligatorio.
		fiscal.rfc = "XEXX010101000";
		if (!fiscal.taxId) {
			throw new ValidationError(
				"fiscal.taxId es requerido para ubicaciones fuera de México",
			);
		}
	}

	const idOrigenDestino = await generateNextIdOrigenDestino(orgId);

	return {
		dto: {...dto, fiscal},
		idOrigenDestino,
	};
}

// ── Listar ────────────────────────────────────────────────────────────────

export async function listLocations(
	orgId: string,
	filter: LocationQueryFilter,
): Promise<{locations: Location[]; total: number}> {
	return findLocations(orgId, filter);
}

// ── Obtener por ID ────────────────────────────────────────────────────────

export async function getLocation(
	id: string,
	orgId: string,
): Promise<Location> {
	const location = await findLocationById(id, orgId);
	if (!location) throw new NotFoundError("Location");
	return location;
}

// ── Obtener por idOrigenDestino ───────────────────────────────────────────

export async function getLocationByIdOrigenDestino(
	orgId: string,
	idOrigenDestino: string,
): Promise<Location> {
	const location = await findLocationByIdOrigenDestino(orgId, idOrigenDestino);
	if (!location) throw new NotFoundError("Location");
	return location;
}

// ── Búsqueda geoespacial ──────────────────────────────────────────────────

export async function getNearbyLocations(
	orgId: string,
	query: NearbyQuery,
): Promise<Location[]> {
	if (!Number.isFinite(query.lat) || !Number.isFinite(query.lng)) {
		throw new ValidationError("lat y lng son requeridos y numéricos");
	}
	if (!Number.isFinite(query.radiusMeters) || query.radiusMeters <= 0) {
		throw new ValidationError("radiusMeters debe ser positivo");
	}
	return findLocationsNearby(
		orgId,
		query.lat,
		query.lng,
		query.radiusMeters,
		query.limit,
	);
}

// ── Autocomplete ──────────────────────────────────────────────────────────

export async function autocompleteLocations(
	orgId: string,
	q: string,
): Promise<Location[]> {
	return autocompleteLocationsRepo(orgId, q);
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function registerLocation(
	orgId: string,
	dto: CreateLocationDto,
	context: AuditContext,
): Promise<Location> {
	if (!dto.name?.trim()) throw new ValidationError("name es requerido");
	if (!dto.location || !Array.isArray(dto.location.coordinates)) {
		throw new ValidationError("location.coordinates es requerido");
	}
	if (!dto.geofence) throw new ValidationError("geofence es requerida");
	validateGeofence(dto.geofence);

	const {dto: normalizedDto, idOrigenDestino} =
		await normalizeFiscalForCreate(orgId, dto);

	if (!context.actor) {
		throw new ForbiddenError("Actor required to create location");
	}

	// TODO: cuando exista el módulo clients, hacer lookup de client.name
	// para poblar denormalizedRefs.clientName.
	const clientName: string | null = null;

	const location = await createLocation({
		...normalizedDto,
		orgId,
		createdBy: context.actor.id,
		createdByName: context.actor.displayName,
		clientName,
		idOrigenDestino,
	});

	await emitAuditEvent({
		category: "catalogs",
		action: "location_created",
		target: {type: "location", id: location.id, displayName: location.name},
		metadata: {
			isFiscal: location.isFiscal,
			...(location.idOrigenDestino && {idOrigenDestino: location.idOrigenDestino}),
		},
		context,
	});

	return location;
}

// ── Actualizar ────────────────────────────────────────────────────────────

const UPDATABLE_FIELDS = [
	"name",
	"description",
	"location",
	"geofence",
	"isFiscal",
	"fiscal",
	"address",
	"clientId",
	"contact",
	"operatingHours",
	"accessHours",
	"isActive",
] as const satisfies readonly (keyof UpdateLocationDto)[];

export async function editLocation(
	id: string,
	orgId: string,
	dto: UpdateLocationDto,
	context: AuditContext,
): Promise<Location> {
	const existing = await findLocationById(id, orgId);
	if (!existing) throw new NotFoundError("Location");

	if (!context.actor) {
		throw new ForbiddenError("Actor required to update location");
	}

	if (dto.geofence) validateGeofence(dto.geofence);

	// idOrigenDestino jamás se regenera ni se cambia: se preserva el del existente.
	// Si el caller intenta cambiar isFiscal, la geocerca o address, ese cambio
	// se aplica pero idOrigenDestino se conserva tal cual (solo se asigna en create).

	// TODO bloquear cambio de isFiscal si hay CFDI emitidos (collection futura).

	// Si fiscal cambió o RFC se modificó, limpiar metadata de validación SAT.
	let fiscal = dto.fiscal;
	if (fiscal !== undefined && existing.fiscal) {
		const rfcChanged = fiscal?.rfc !== existing.fiscal.rfc;
		const razonChanged = fiscal?.razonSocial !== existing.fiscal.razonSocial;
		if (rfcChanged || razonChanged) {
			fiscal = {
				...fiscal,
				rfcValidatedAt: null,
				rfcValidatedStatus: null,
				validationSource: null,
				validationNotes: null,
			} as NonNullable<typeof fiscal>;
		}
	}

	// TODO: si dto.clientId !== undefined y existe módulo clients, refrescar clientName.
	const clientName: string | null | undefined = undefined;

	const updated = await updateLocation(id, orgId, {
		...dto,
		fiscal,
		updatedBy: context.actor.id,
		updatedByName: context.actor.displayName,
		clientName,
	});
	if (!updated) throw new NotFoundError("Location");

	const diff = computeDiff(existing, updated, {
		allowedFields: UPDATABLE_FIELDS,
	});

	if (diff) {
		await emitAuditEvent({
			category: "catalogs",
			action: "location_updated",
			target: {type: "location", id, displayName: updated.name},
			diff,
			context,
		});
	}

	logger.info({id, orgId}, "Location updated");

	return updated;
}

// ── Validar fiscal contra SAT (FacturoPorTi) ──────────────────────────────

export async function validateLocationFiscal(
	id: string,
	orgId: string,
	dto: ValidateFiscalDto,
	context: AuditContext,
): Promise<Location> {
	const existing = await findLocationById(id, orgId);
	if (!existing) throw new NotFoundError("Location");

	if (!existing.isFiscal) {
		throw new ValidationError(
			"La ubicación no es fiscal; no se puede validar contra SAT",
		);
	}

	let status: "valid" | "invalid" | "pending" = "pending";
	let notes: string | null = null;

	try {
		const result = await validateRFC({
			rfc: dto.rfc,
			nombreRazonSocial: dto.razonSocial,
			regimenFiscal: existing.fiscal?.regimenFiscal?.code,
			codigoPostal: dto.cp,
		});
		status = result.esValido ? "valid" : "invalid";
		notes = result.esValido
			? `✓ ${result.estatus}`
			: `${result.estatus} — datos no coinciden con CSF`;
	} catch (err) {
		logger.warn({err, locationId: id}, "RFC validation against SAT failed");
		status = "pending";
		notes =
			(err as Error)?.message ??
			"Error al consultar SAT — reintentar más tarde";
	}

	const updated = await persistFiscalValidation(id, orgId, {
		rfcValidatedAt: new Date(),
		rfcValidatedStatus: status,
		validationSource: "facturoporti",
		validationNotes: notes,
	});
	if (!updated) throw new NotFoundError("Location");

	await emitAuditEvent({
		category: "catalogs",
		action: "location_fiscal_validated",
		target: {type: "location", id, displayName: updated.name},
		metadata: {status, source: "facturoporti"},
		context,
	});

	return updated;
}

// ── Eliminar (soft) ───────────────────────────────────────────────────────

export async function removeLocation(
	id: string,
	orgId: string,
	context: AuditContext,
): Promise<void> {
	const existing = await findLocationById(id, orgId);
	if (!existing) throw new NotFoundError("Location");

	if (existing.isSystem) {
		throw new ForbiddenError("No se pueden eliminar ubicaciones del sistema");
	}

	const ok = await softDeleteLocation(id, orgId);
	if (!ok) throw new NotFoundError("Location");

	await emitAuditEvent({
		category: "catalogs",
		action: "location_deleted",
		target: {type: "location", id, displayName: existing.name},
		metadata: {idOrigenDestino: existing.idOrigenDestino},
		context,
	});

	logger.info({id, orgId}, "Location soft-deleted");
}

// ── Check point in geofence ───────────────────────────────────────────────

export async function checkPointInGeofence(
	id: string,
	orgId: string,
	dto: CheckPointDto,
): Promise<CheckPointResult> {
	const location = await findLocationById(id, orgId);
	if (!location) throw new NotFoundError("Location");

	const inside = isPointInGeofence(dto.lat, dto.lng, location.geofence);
	return {insideGeofence: inside};
}

// ── Helpers de geometría (simple, in-memory) ──────────────────────────────

function isPointInGeofence(
	lat: number,
	lng: number,
	geofence: Geofence,
): boolean {
	if (geofence.type === "circle") {
		const distance = haversineDistance(
			lat,
			lng,
			geofence.center.lat,
			geofence.center.lng,
		);
		return distance <= geofence.radiusMeters;
	}
	// polygon — ray casting
	const points = geofence.points;
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const xi = points[i].lng;
		const yi = points[i].lat;
		const xj = points[j].lng;
		const yj = points[j].lat;
		const intersect =
			yi > lat !== yj > lat &&
			lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function haversineDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6_371_000; // radio Tierra en metros
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}
