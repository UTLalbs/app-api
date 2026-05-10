import type {Request, Response} from "express";

import {asyncHandler} from "../../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../../shared/utils/auditContext";

import {
	createDocumentFromDraft,
	deleteUnitDocument,
	discardDocumentDraft,
	extractAndStashDocument,
	getUnitDocument,
	getUnitDocumentSignedUrl,
	listUnitDocuments,
	replaceUnitDocument,
	updateUnitDocument,
	uploadUnitDocument,
} from "./unit-documents.service";

function getOrgId(req: Request): string {
	return req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
}

// ── List ──────────────────────────────────────────────────────────────────

export const listUnitDocumentsHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const docs = await listUnitDocuments(getOrgId(req), String(req.params.unitId));
		res.json({success: true, data: docs});
	},
);

// ── Get one ───────────────────────────────────────────────────────────────

export const getUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const doc = await getUnitDocument(getOrgId(req), String(req.params.id));
		res.json({success: true, data: doc});
	},
);

// ── Presigned URL ─────────────────────────────────────────────────────────

export const getUnitDocumentUrlHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const result = await getUnitDocumentSignedUrl(
			getOrgId(req),
			String(req.params.id),
		);
		res.json({success: true, data: result});
	},
);

// ── Extract + stash ───────────────────────────────────────────────────────

export const extractUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const result = await extractAndStashDocument(getOrgId(req), req.file);
		res.json({success: true, data: result});
	},
);

// ── Create from draft ─────────────────────────────────────────────────────

export const createDocumentFromDraftHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const doc = await createDocumentFromDraft(
			getOrgId(req),
			String(req.params.unitId),
			req.user!.id,
			{
				draftKey: req.body.draftKey,
				fileName: req.body.fileName,
				fileSize: Number(req.body.fileSize),
				mimeType: req.body.mimeType,
				type: req.body.type,
				name: req.body.name ?? null,
				issuedAt: req.body.issuedAt ?? null,
				expiresAt: req.body.expiresAt ?? null,
				alertDays:
					req.body.alertDays !== undefined && req.body.alertDays !== null
						? Number(req.body.alertDays)
						: null,
				notes: req.body.notes ?? null,
				extractedData: req.body.extractedData ?? null,
				extractionConfidence: req.body.extractionConfidence ?? null,
			},
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: doc});
	},
);

// ── Discard draft ─────────────────────────────────────────────────────────

export const discardDocumentDraftHandler = asyncHandler(
	async (req: Request, res: Response) => {
		await discardDocumentDraft(getOrgId(req), String(req.body.draftKey ?? ""));
		res.status(204).send();
	},
);

// ── Upload ────────────────────────────────────────────────────────────────

export const uploadUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}

		const extractedData = parseMaybeJson(req.body.extractedData);

		const doc = await uploadUnitDocument(
			getOrgId(req),
			String(req.params.unitId),
			req.user!.id,
			req.file,
			{
				type: req.body.type,
				name: req.body.name ?? null,
				issuedAt: req.body.issuedAt ?? null,
				expiresAt: req.body.expiresAt ?? null,
				alertDays:
					req.body.alertDays !== undefined && req.body.alertDays !== ""
						? Number(req.body.alertDays)
						: null,
				notes: req.body.notes ?? null,
				extractedData,
				extractionConfidence: req.body.extractionConfidence ?? null,
			},
			buildAuditContext(req),
		);

		res.status(201).json({success: true, data: doc});
	},
);

// ── Update metadata ───────────────────────────────────────────────────────

export const updateUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const doc = await updateUnitDocument(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.body,
			buildAuditContext(req),
		);
		res.json({success: true, data: doc});
	},
);

// ── Replace ───────────────────────────────────────────────────────────────

export const replaceUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const doc = await replaceUnitDocument(
			getOrgId(req),
			String(req.params.id),
			req.user!.id,
			req.file,
			buildAuditContext(req),
		);
		res.json({success: true, data: doc});
	},
);

// ── Delete ────────────────────────────────────────────────────────────────

export const deleteUnitDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		await deleteUnitDocument(
			getOrgId(req),
			String(req.params.id),
			buildAuditContext(req),
		);
		res.status(204).send();
	},
);

// ── Helpers ───────────────────────────────────────────────────────────────

function parseMaybeJson(value: unknown): Record<string, unknown> | null {
	if (!value) return null;
	if (typeof value === "object") return value as Record<string, unknown>;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return typeof parsed === "object" && parsed !== null ? parsed : null;
		} catch {
			return null;
		}
	}
	return null;
}
