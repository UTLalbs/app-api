import type {Request, Response} from "express";

import {ForbiddenError} from "../../shared/errors/AppError";
import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	getOrganizationById,
	listOrganizations,
	registerOrganization,
	editOrganization,
	removeOrganization,
} from "./organization.service";
import type {
	CreateOrganizationInput,
	UpdateOrganizationInput,
} from "./organization.validator";

export const getOrganization = asyncHandler(
	async (req: Request, res: Response) => {
		const id = String(req.params.id);
		const user = req.user!;
		const isSuperAdmin = user.userType === "super_admin";
		const isOwnOrg = user.orgId === id || user.impersonating?.orgId === id;
		if (!isSuperAdmin && !isOwnOrg) {
			throw new ForbiddenError("organization");
		}
		const org = await getOrganizationById(id);
		res.json({success: true, data: org});
	},
);

export const getOrganizations = asyncHandler(
	async (_req: Request, res: Response) => {
		const orgs = await listOrganizations();
		res.json({success: true, data: orgs, meta: {total: orgs.length}});
	},
);

export const createOrganization = asyncHandler(
	async (req: Request & CreateOrganizationInput, res: Response) => {
		const org = await registerOrganization(
			{
				name: req.body.name,
				slug: req.body.slug,
				settings: req.body.settings,
				fiscalData: req.body.fiscalData,
				contacts: req.body.contacts,
			},
			req.user!.id,
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: org});
	},
);

export const updateOrganization = asyncHandler(
	async (req: Request & UpdateOrganizationInput, res: Response) => {
		const org = await editOrganization(
			String(req.params.id),
			{
				name: req.body.name,
				status: req.body.status,
				settings: req.body.settings,
				fiscalData: req.body.fiscalData,
				contacts: req.body.contacts,
			},
			buildAuditContext(req),
		);
		res.json({success: true, data: org});
	},
);

export const deleteOrganization = asyncHandler(
	async (req: Request, res: Response) => {
		await removeOrganization(String(req.params.id), buildAuditContext(req));
		res.status(204).send();
	},
);
