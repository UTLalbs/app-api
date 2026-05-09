import type {Request, Response} from "express";

import {asyncHandler} from "../../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../../shared/utils/auditContext";

import {
	createDocumentFromDraft,
	deleteTrailerDocument,
	discardDocumentDraft,
	extractAndStashDocument,
	getTrailerDocument,
	getTrailerDocumentSignedUrl,
	listTrailerDocuments,
	replaceTrailerDocument,
	updateTrailerDocument,
	uploadTrailerDocument,
} from "./trailer-documents.service";

// ── List ──────────────────────────────────────────────────────────────────

export const listTrailerDocumentsHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const docs = await listTrailerDocuments(orgId, String(req.params.trailerId));
		res.json({success: true, data: docs});
	},
);

// ── Get one ───────────────────────────────────────────────────────────────

export const getTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const doc = await getTrailerDocument(orgId, String(req.params.id));
		res.json({success: true, data: doc});
	},
);

// ── Presigned URL ─────────────────────────────────────────────────────────

export const getTrailerDocumentUrlHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const result = await getTrailerDocumentSignedUrl(
			orgId,
			String(req.params.id),
		);
		res.json({success: true, data: result});
	},
);

// ── Extract + stash (sube a S3 pending, sin trailerId) ───────────────────

export const extractTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const result = await extractAndStashDocument(orgId, req.file);
		res.json({success: true, data: result});
	},
);

// ── Create from draft (asocia archivo previamente subido) ────────────────

export const createDocumentFromDraftHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const doc = await createDocumentFromDraft(
			orgId,
			String(req.params.trailerId),
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

// ── Discard draft (cuando el usuario quita el archivo en el wizard) ──────

export const discardDocumentDraftHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await discardDocumentDraft(orgId, String(req.body.draftKey ?? ""));
		res.status(204).send();
	},
);

// ── Upload ────────────────────────────────────────────────────────────────

export const uploadTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}

		// Multipart: campos vienen como string. Parsear JSON si vino serializado.
		const extractedData = parseMaybeJson(req.body.extractedData);

		const doc = await uploadTrailerDocument(
			orgId,
			String(req.params.trailerId),
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

export const updateTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const doc = await updateTrailerDocument(
			orgId,
			String(req.params.id),
			req.user!.id,
			req.body,
			buildAuditContext(req),
		);
		res.json({success: true, data: doc});
	},
);

// ── Replace (renovación) ──────────────────────────────────────────────────

export const replaceTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}
		const doc = await replaceTrailerDocument(
			orgId,
			String(req.params.id),
			req.user!.id,
			req.file,
			buildAuditContext(req),
		);
		res.json({success: true, data: doc});
	},
);

// ── Delete ────────────────────────────────────────────────────────────────

export const deleteTrailerDocumentHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await deleteTrailerDocument(
			orgId,
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
