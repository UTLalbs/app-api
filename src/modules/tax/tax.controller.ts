import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  getPostalCodeData,
  validateRFC,
} from './tax.service';
import type { ValidateRFCInput } from './tax.validator';

// ── GET /api/v1/tax/postal-code/:cp ───────────────────────────────────────

export const getPostalCode = asyncHandler(
  async (req: Request, res: Response) => {
    const cp = String(req.params.cp);

    const data = await getPostalCodeData(cp);

    res.json({ success: true, data });
  },
);

// ── POST /api/v1/tax/validate-rfc ─────────────────────────────────────────

export const validateRFCHandler = asyncHandler(
  async (req: Request & ValidateRFCInput, res: Response) => {
    const result = await validateRFC({
      rfc:               req.body.rfc,
      nombreRazonSocial: req.body.nombreRazonSocial,
      regimenFiscal:     req.body.regimenFiscal ?? null,
      codigoPostal:      req.body.codigoPostal,
    });

    res.json({ success: true, data: result });
  },
);