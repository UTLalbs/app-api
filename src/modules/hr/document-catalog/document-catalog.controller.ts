import type {Request, Response} from "express";

import {asyncHandler} from "../../../shared/utils/asyncHandler";

import {
	listDocumentCatalog,
	createDocumentCatalogItem,
	editDocumentCatalogItem,
	removeDocumentCatalogItem,
} from "./document-catalog.service";
import type {DocumentCatalogCategory} from "./document-catalog.types";
import type {
	CreateDocumentCatalogInput,
	ListDocumentCatalogInput,
	UpdateDocumentCatalogInput,
} from "./document-catalog.validator";

// ── GET /api/v1/hr/document-catalog ───────────────────────────────────────

export const getDocumentCatalog = asyncHandler(
	async (req: Request & ListDocumentCatalogInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const isActive =
			req.query.isActive === "true"
				? true
				: req.query.isActive === "false"
					? false
					: undefined;

		const items = await listDocumentCatalog(orgId, {
			category: req.query.category as DocumentCatalogCategory | undefined,
			isActive,
		});

		res.json({success: true, data: items, meta: {total: items.length}});
	},
);

// ── POST /api/v1/hr/document-catalog ──────────────────────────────────────

export const createDocumentCatalog = asyncHandler(
	async (req: Request & CreateDocumentCatalogInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const item = await createDocumentCatalogItem(orgId, req.user!.id, {
			name: req.body.name,
			category: req.body.category,
			required: req.body.required ?? false,
			hasExpiry: req.body.hasExpiry ?? false,
			hasRenewal: req.body.hasRenewal ?? false,
		});

		res.status(201).json({success: true, data: item});
	},
);

// ── PATCH /api/v1/hr/document-catalog/:id ─────────────────────────────────

export const updateDocumentCatalog = asyncHandler(
	async (req: Request & UpdateDocumentCatalogInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const item = await editDocumentCatalogItem(String(req.params.id), orgId, {
			name: req.body.name,
			category: req.body.category,
			required: req.body.required,
			hasExpiry: req.body.hasExpiry,
			hasRenewal: req.body.hasRenewal,
			isActive: req.body.isActive,
		});

		res.json({success: true, data: item});
	},
);

// ── DELETE /api/v1/hr/document-catalog/:id ────────────────────────────────

export const deleteDocumentCatalog = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		await removeDocumentCatalogItem(String(req.params.id), orgId);

		res.status(204).send();
	},
);
