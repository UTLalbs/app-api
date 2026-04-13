import type {Request, Response} from "express";

import {asyncHandler} from "../../../shared/utils/asyncHandler";

import {
	listDocumentProfiles,
	createDocumentProfileItem,
	editDocumentProfile,
	removeDocumentProfile,
} from "./document-profile.service";
import type {
	CreateDocumentProfileInput,
	UpdateDocumentProfileInput,
} from "./document-profile.validator";

export const getDocumentProfiles = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const profiles = await listDocumentProfiles(orgId);
		res.json({success: true, data: profiles, meta: {total: profiles.length}});
	},
);

export const createDocumentProfile = asyncHandler(
	async (req: Request & CreateDocumentProfileInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const profile = await createDocumentProfileItem(orgId, req.user!.id, {
			name: req.body.name,
			description: req.body.description ?? null,
			documentTypes: req.body.documentTypes,
		});
		res.status(201).json({success: true, data: profile});
	},
);

export const updateDocumentProfile = asyncHandler(
	async (req: Request & UpdateDocumentProfileInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const profile = await editDocumentProfile(String(req.params.id), orgId, {
			name: req.body.name,
			description: req.body.description,
			documentTypes: req.body.documentTypes,
		});
		res.json({success: true, data: profile});
	},
);

export const deleteDocumentProfile = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await removeDocumentProfile(String(req.params.id), orgId);
		res.status(204).send();
	},
);
