import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	checkTrailerDuplicates,
	createTrailer,
	decodeTrailerVin,
	deleteTrailer,
	getTrailer,
	listTrailers,
	quickRegisterTrailer,
	removeTrailerPhoto,
	setTrailerPhoto,
	transitionTrailerStatus,
	updateTrailer,
} from "./trailers.service";
import type {
	CreateTrailerDto,
	QuickRegisterTrailerDto,
	TrailerPhotoPosition,
	UpdateTrailerDto,
} from "./trailers.types";

function getOrgId(req: Request): string {
	const user = req.user!;
	return user.impersonating?.orgId ?? user.orgId;
}

// ── GET /api/v1/trailers ──────────────────────────────────────────────────

export const listTrailersHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = getOrgId(req);
		const q = req.query as {
			status?: string;
			ctrSubtype?: string;
			ownershipType?: string;
			search?: string;
			page?: number;
			limit?: number;
			sortField?: string;
			sortDirection?: "asc" | "desc";
		};
		const {trailers, total} = await listTrailers(orgId, {
			status: q.status as never,
			ctrSubtype: q.ctrSubtype,
			ownershipType: q.ownershipType as never,
			search: q.search,
			page: q.page,
			limit: q.limit,
			sortField: q.sortField,
			sortDirection: q.sortDirection,
		});
		res.json({success: true, data: trailers, meta: {total}});
	},
);

// ── GET /api/v1/trailers/:id ──────────────────────────────────────────────

export const getTrailerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await getTrailer(getOrgId(req), String(req.params.id));
		res.json({success: true, data: trailer});
	},
);

// ── POST /api/v1/trailers (alta completa) ─────────────────────────────────

export const createTrailerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await createTrailer(
			getOrgId(req),
			req.user!.id,
			req.body as unknown as CreateTrailerDto,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: trailer});
	},
);

// ── POST /api/v1/trailers/quick-register ──────────────────────────────────

export const quickRegisterTrailerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await quickRegisterTrailer(
			getOrgId(req),
			req.user!.id,
			req.body as unknown as QuickRegisterTrailerDto,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: trailer});
	},
);

// ── PATCH /api/v1/trailers/:id ────────────────────────────────────────────

export const updateTrailerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await updateTrailer(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.body as unknown as UpdateTrailerDto,
			buildAuditContext(req),
		);
		res.json({success: true, data: trailer});
	},
);

// ── DELETE /api/v1/trailers/:id ───────────────────────────────────────────

export const deleteTrailerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		await deleteTrailer(
			getOrgId(req),
			String(req.params.id),
			buildAuditContext(req),
		);
		res.status(204).send();
	},
);

// ── POST /api/v1/trailers/decode-vin ──────────────────────────────────────

export const decodeVinHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const result = await decodeTrailerVin(String(req.body.vin));
		res.json({success: true, data: result});
	},
);

// ── POST /api/v1/trailers/check-duplicate ─────────────────────────────────

export const checkDuplicateHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const matches = await checkTrailerDuplicates(getOrgId(req), {
			vin: req.body.vin ?? null,
			plates_mx: req.body.plates_mx ?? null,
			plates_us: req.body.plates_us ?? null,
			economicNumber: req.body.economicNumber ?? null,
			excludeTrailerId: req.body.excludeTrailerId ?? null,
		});
		res.json({success: true, data: {matches}});
	},
);

// ── POST /api/v1/trailers/:id/transition-status ───────────────────────────

export const transitionStatusHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await transitionTrailerStatus(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.body.newStatus,
			req.body.reason ?? null,
			buildAuditContext(req),
		);
		res.json({success: true, data: trailer});
	},
);

// ── POST /api/v1/trailers/:id/photos/:position ────────────────────────────

export const setTrailerPhotoHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const trailer = await setTrailerPhoto(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.params.position as TrailerPhotoPosition,
			req.file,
			buildAuditContext(req),
		);
		res.json({success: true, data: trailer});
	},
);

// ── DELETE /api/v1/trailers/:id/photos/:position ──────────────────────────

export const removeTrailerPhotoHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const trailer = await removeTrailerPhoto(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.params.position as TrailerPhotoPosition,
			buildAuditContext(req),
		);
		res.json({success: true, data: trailer});
	},
);
