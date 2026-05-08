import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	createTrailer,
	decodeTrailerVin,
	deleteTrailer,
	getTrailer,
	listTrailers,
	quickRegisterTrailer,
	transitionTrailerStatus,
	updateTrailer,
} from "./trailers.service";
import type {
	CreateTrailerDto,
	QuickRegisterTrailerDto,
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
		};
		const {trailers, total} = await listTrailers(orgId, {
			status: q.status as never,
			ctrSubtype: q.ctrSubtype,
			ownershipType: q.ownershipType as never,
			search: q.search,
			page: q.page,
			limit: q.limit,
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
