import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	createBusinessPartner,
	deleteBusinessPartner,
	getBusinessPartner,
	listBusinessPartners,
	updateBusinessPartner,
	validateBusinessPartnerRfc,
} from "./business-partners.service";
import type {BusinessPartnerRole, CreateBusinessPartnerDto, UpdateBusinessPartnerDto} from "./business-partners.types";
import type {
	CreateBusinessPartnerInput,
	ListBusinessPartnersInput,
	UpdateBusinessPartnerInput,
} from "./business-partners.validator";

function getOrgId(req: Request): string {
	const user = req.user!;
	return user.impersonating?.orgId ?? user.orgId;
}

// ── GET /api/v1/business-partners ─────────────────────────────────────────

export const listBusinessPartnersHandler = asyncHandler(
	async (req: Request & ListBusinessPartnersInput, res: Response) => {
		const orgId = getOrgId(req);
		const {partners, total} = await listBusinessPartners(orgId, {
			role: req.query.role as BusinessPartnerRole | undefined,
			isActive: req.query.isActive,
			taxRegime: req.query.taxRegime,
			search: req.query.search,
			page: req.query.page,
			limit: req.query.limit,
		});
		res.json({success: true, data: partners, meta: {total}});
	},
);

// ── GET /api/v1/business-partners/:id ─────────────────────────────────────

export const getBusinessPartnerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = getOrgId(req);
		const partner = await getBusinessPartner(orgId, String(req.params.id));
		res.json({success: true, data: partner});
	},
);

// ── POST /api/v1/business-partners ────────────────────────────────────────

export const createBusinessPartnerHandler = asyncHandler(
	async (req: Request & CreateBusinessPartnerInput, res: Response) => {
		const orgId = getOrgId(req);
		const partner = await createBusinessPartner(
			orgId,
			req.user!.id,
			req.body as unknown as CreateBusinessPartnerDto,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: partner});
	},
);

// ── PATCH /api/v1/business-partners/:id ───────────────────────────────────

export const updateBusinessPartnerHandler = asyncHandler(
	async (req: Request & UpdateBusinessPartnerInput, res: Response) => {
		const orgId = getOrgId(req);
		const partner = await updateBusinessPartner(
			orgId,
			String(req.params.id),
			req.user!.id,
			req.body as unknown as UpdateBusinessPartnerDto,
			buildAuditContext(req),
		);
		res.json({success: true, data: partner});
	},
);

// ── DELETE /api/v1/business-partners/:id (soft) ───────────────────────────

export const deleteBusinessPartnerHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = getOrgId(req);
		await deleteBusinessPartner(
			orgId,
			String(req.params.id),
			buildAuditContext(req),
		);
		res.status(204).send();
	},
);

// ── POST /api/v1/business-partners/:id/validate-rfc ───────────────────────

export const validateBusinessPartnerRfcHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = getOrgId(req);
		const result = await validateBusinessPartnerRfc(
			orgId,
			String(req.params.id),
			req.user!.id,
		);
		res.json({success: true, data: result});
	},
);
