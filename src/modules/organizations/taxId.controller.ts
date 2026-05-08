import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	addTaxId,
	disableTaxId,
	getTaxId,
	getTaxIds,
	setDefaultTaxId,
	updateTaxId,
	validateTaxIdRfc,
} from "./taxId.service";
import type {CreateTaxIdInput, UpdateTaxIdInput} from "./taxId.validator";

// ── GET /:id/tax-ids ───────────────────────────────────────────────────────

export const listTaxIdsHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const taxIds = await getTaxIds(String(req.params.id));
		res.json({success: true, data: taxIds});
	},
);

// ── GET /:id/tax-ids/:taxIdId ──────────────────────────────────────────────

export const getTaxIdHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const taxId = await getTaxId(
			String(req.params.id),
			String(req.params.taxIdId),
		);
		res.json({success: true, data: taxId});
	},
);

// ── POST /:id/tax-ids ──────────────────────────────────────────────────────

export const addTaxIdHandler = asyncHandler(
	async (req: Request & CreateTaxIdInput, res: Response) => {
		const taxId = await addTaxId(
			String(req.params.id),
			{
				rfc: req.body.rfc,
				razonSocial: req.body.razonSocial,
				regimenFiscal: req.body.regimenFiscal,
				address: req.body.address ?? null,
				isDefault: req.body.isDefault,
			},
			buildAuditContext(req),
		);
		res.status(201).json({success: true, data: taxId});
	},
);

// ── PATCH /:id/tax-ids/:taxIdId ────────────────────────────────────────────

export const updateTaxIdHandler = asyncHandler(
	async (req: Request & UpdateTaxIdInput, res: Response) => {
		const taxId = await updateTaxId(
			String(req.params.id),
			String(req.params.taxIdId),
			{
				rfc: req.body.rfc,
				razonSocial: req.body.razonSocial,
				regimenFiscal: req.body.regimenFiscal,
				address: req.body.address ?? null,
			},
			buildAuditContext(req),
		);
		res.json({success: true, data: taxId});
	},
);

// ── DELETE /:id/tax-ids/:taxIdId — soft disable ───────────────────────────

export const disableTaxIdHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const taxId = await disableTaxId(
			String(req.params.id),
			String(req.params.taxIdId),
			buildAuditContext(req),
		);
		res.json({success: true, data: taxId});
	},
);

// ── POST /:id/tax-ids/:taxIdId/set-default ─────────────────────────────────

export const setDefaultTaxIdHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const taxId = await setDefaultTaxId(
			String(req.params.id),
			String(req.params.taxIdId),
			buildAuditContext(req),
		);
		res.json({success: true, data: taxId});
	},
);

// ── POST /:id/tax-ids/:taxIdId/validate-rfc ────────────────────────────────

export const validateTaxIdRfcHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const result = await validateTaxIdRfc(
			String(req.params.id),
			String(req.params.taxIdId),
		);
		res.json({success: true, data: result});
	},
);
