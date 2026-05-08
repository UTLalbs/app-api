import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";

import {getPostalCodeData, validateRfc} from "./sat.service";
import type {ValidateRfcInput} from "./sat.validator";

// ── GET /api/v1/sat/postal-code/:cp ────────────────────────────────────────

export const getPostalCode = asyncHandler(
	async (req: Request, res: Response) => {
		const cp = String(req.params.cp);
		const data = await getPostalCodeData(cp);
		res.json({success: true, data});
	},
);

// ── POST /api/v1/sat/validate-rfc ──────────────────────────────────────────

export const validateRfcHandler = asyncHandler(
	async (req: Request & ValidateRfcInput, res: Response) => {
		const result = await validateRfc({
			rfc: req.body.rfc,
			nombreRazonSocial: req.body.nombreRazonSocial,
			regimenFiscal: req.body.regimenFiscal ?? null,
			codigoPostal: req.body.codigoPostal,
		});
		res.json({success: true, data: result});
	},
);
