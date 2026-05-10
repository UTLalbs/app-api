import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	assignOperatorToUnit,
	checkUnitDuplicates,
	createUnit,
	decodeUnitVin,
	deleteUnit,
	getUnit,
	listUnits,
	quickRegisterUnit,
	removeUnitPhoto,
	setUnitPhoto,
	transitionUnitStatus,
	unassignOperatorFromUnit,
	updateUnit,
} from "./units.service";
import type {UnitPhotoPosition} from "./units.types";
import type {
	CreateUnitDto,
	QuickRegisterUnitDto,
	UpdateUnitDto,
} from "./units.types";

function getOrgId(req: Request): string {
	const user = req.user!;
	return user.impersonating?.orgId ?? user.orgId;
}

// ── GET /api/v1/units ─────────────────────────────────────────────────────

export const listUnitsHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = getOrgId(req);
		const q = req.query as {
			status?: string;
			satConfigCode?: string;
			ownershipType?: string;
			fuelType?: string;
			hasOperator?: boolean;
			search?: string;
			page?: number;
			limit?: number;
			sortField?: string;
			sortDirection?: "asc" | "desc";
		};
		const {units, total} = await listUnits(orgId, {
			status: q.status as never,
			satConfigCode: q.satConfigCode,
			ownershipType: q.ownershipType as never,
			fuelType: q.fuelType as never,
			hasOperator: q.hasOperator,
			search: q.search,
			page: q.page,
			limit: q.limit,
			sortField: q.sortField,
			sortDirection: q.sortDirection,
		});
		res.json({success: true, data: units, meta: {total}});
	},
);

// ── GET /api/v1/units/:id ─────────────────────────────────────────────────

export const getUnitHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await getUnit(getOrgId(req), String(req.params.id));
		res.json({success: true, data: unit});
	},
);

// ── POST /api/v1/units ────────────────────────────────────────────────────

export const createUnitHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await createUnit(
			getOrgId(req),
			req.user!.id,
			req.body as unknown as CreateUnitDto,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: unit});
	},
);

// ── POST /api/v1/units/quick-register ─────────────────────────────────────

export const quickRegisterUnitHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await quickRegisterUnit(
			getOrgId(req),
			req.user!.id,
			req.body as unknown as QuickRegisterUnitDto,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: unit});
	},
);

// ── PATCH /api/v1/units/:id ───────────────────────────────────────────────

export const updateUnitHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await updateUnit(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.body as unknown as UpdateUnitDto,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);

// ── DELETE /api/v1/units/:id ──────────────────────────────────────────────

export const deleteUnitHandler = asyncHandler(
	async (req: Request, res: Response) => {
		await deleteUnit(
			getOrgId(req),
			String(req.params.id),
			buildAuditContext(req),
		);
		res.status(204).send();
	},
);

// ── POST /api/v1/units/decode-vin ─────────────────────────────────────────

export const decodeUnitVinHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const result = await decodeUnitVin(String(req.body.vin));
		res.json({success: true, data: result});
	},
);

// ── POST /api/v1/units/check-duplicate ────────────────────────────────────

export const checkUnitDuplicateHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const matches = await checkUnitDuplicates(getOrgId(req), {
			vin: req.body.vin ?? null,
			plates_mx: req.body.plates_mx ?? null,
			plates_us: req.body.plates_us ?? null,
			economicNumber: req.body.economicNumber ?? null,
			excludeUnitId: req.body.excludeUnitId ?? null,
		});
		res.json({success: true, data: {matches}});
	},
);

// ── POST /api/v1/units/:id/transition-status ──────────────────────────────

export const transitionUnitStatusHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await transitionUnitStatus(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.body.newStatus,
			req.body.reason ?? null,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);

// ── POST /api/v1/units/:id/assign-operator ────────────────────────────────

export const assignOperatorHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await assignOperatorToUnit(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			String(req.body.operatorEmployeeId),
			req.body.notes ?? null,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);

// ── POST /api/v1/units/:id/unassign-operator ──────────────────────────────

export const unassignOperatorHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await unassignOperatorFromUnit(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);

// ── POST /api/v1/units/:id/photos/:position ───────────────────────────────

export const setUnitPhotoHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const unit = await setUnitPhoto(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.params.position as UnitPhotoPosition,
			req.file,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);

// ── DELETE /api/v1/units/:id/photos/:position ─────────────────────────────

export const removeUnitPhotoHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const unit = await removeUnitPhoto(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.params.position as UnitPhotoPosition,
			buildAuditContext(req),
		);
		res.json({success: true, data: unit});
	},
);
