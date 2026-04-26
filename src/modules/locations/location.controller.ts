import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	autocompleteLocations,
	checkPointInGeofence,
	editLocation,
	getLocation,
	getLocationByIdOrigenDestino,
	getNearbyLocations,
	listLocations,
	registerLocation,
	removeLocation,
	validateLocationFiscal,
} from "./location.service";
import type {
	AutocompleteLocationsInput,
	CheckPointInput,
	CreateLocationInput,
	ListLocationsInput,
	NearbyLocationsInput,
	UpdateLocationInput,
	ValidateFiscalInput,
} from "./location.validator";

function effectiveOrgId(req: Request): string {
	return req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
}

// ── GET /api/v1/locations ────────────────────────────────────────────────

export const getLocations = asyncHandler(
	async (req: Request & ListLocationsInput, res: Response) => {
		const orgId = effectiveOrgId(req);

		const isFiscal =
			req.query.isFiscal === "true"
				? true
				: req.query.isFiscal === "false"
					? false
					: undefined;
		const isActive =
			req.query.isActive === "true"
				? true
				: req.query.isActive === "false"
					? false
					: undefined;

		const result = await listLocations(orgId, {
			search: req.query.search,
			country: req.query.country,
			isFiscal,
			isActive,
			clientId: req.query.clientId,
			page: req.query.page,
			limit: req.query.limit,
		});

		res.json({
			success: true,
			data: result.locations,
			meta: {total: result.total},
		});
	},
);

// ── GET /api/v1/locations/:id ────────────────────────────────────────────

export const getLocationById = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = effectiveOrgId(req);
		const location = await getLocation(String(req.params.id), orgId);
		res.json({success: true, data: location});
	},
);

// ── POST /api/v1/locations ───────────────────────────────────────────────

export const createLocationHandler = asyncHandler(
	async (req: Request & CreateLocationInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const location = await registerLocation(
			orgId,
			req.body,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: location});
	},
);

// ── PATCH /api/v1/locations/:id ──────────────────────────────────────────

export const updateLocationHandler = asyncHandler(
	async (req: Request & UpdateLocationInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const location = await editLocation(
			String(req.params.id),
			orgId,
			req.body,
			buildAuditContext(req),
		);
		res.json({success: true, data: location});
	},
);

// ── DELETE /api/v1/locations/:id (soft) ──────────────────────────────────

export const deleteLocationHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = effectiveOrgId(req);
		await removeLocation(
			String(req.params.id),
			orgId,
			buildAuditContext(req),
		);
		res.status(204).send();
	},
);

// ── GET /api/v1/locations/:id/usage ──────────────────────────────────────
// Placeholder hasta que existan los módulos consumidores.

export const getLocationUsageHandler = asyncHandler(
	async (_req: Request, res: Response) => {
		res.json({success: true, data: [], meta: {total: 0}});
	},
);

// ── GET /api/v1/locations/nearby ─────────────────────────────────────────

export const getNearbyHandler = asyncHandler(
	async (req: Request & NearbyLocationsInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const locations = await getNearbyLocations(orgId, {
			lat: req.query.lat,
			lng: req.query.lng,
			radiusMeters: req.query.radiusMeters,
			limit: req.query.limit,
		});
		res.json({success: true, data: locations, meta: {total: locations.length}});
	},
);

// ── GET /api/v1/locations/by-id-origen-destino/:id ───────────────────────

export const getByIdOrigenDestinoHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = effectiveOrgId(req);
		const location = await getLocationByIdOrigenDestino(
			orgId,
			String(req.params.id),
		);
		res.json({success: true, data: location});
	},
);

// ── GET /api/v1/locations/autocomplete ───────────────────────────────────

export const autocompleteHandler = asyncHandler(
	async (req: Request & AutocompleteLocationsInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const locations = await autocompleteLocations(orgId, req.query.q);
		res.json({success: true, data: locations});
	},
);

// ── POST /api/v1/locations/:id/validate-fiscal ───────────────────────────

export const validateFiscalHandler = asyncHandler(
	async (req: Request & ValidateFiscalInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const updated = await validateLocationFiscal(
			String(req.params.id),
			orgId,
			req.body,
			buildAuditContext(req),
		);
		res.json({success: true, data: updated});
	},
);

// ── POST /api/v1/locations/:id/check-point ───────────────────────────────

export const checkPointHandler = asyncHandler(
	async (req: Request & CheckPointInput, res: Response) => {
		const orgId = effectiveOrgId(req);
		const result = await checkPointInGeofence(
			String(req.params.id),
			orgId,
			req.body,
		);
		res.json({success: true, data: result});
	},
);

