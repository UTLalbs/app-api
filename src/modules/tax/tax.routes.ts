import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';

import { getPostalCode, validateRFCHandler } from './tax.controller';
import { postalCodeParamSchema, validateRFCSchema } from './tax.validator';

export const taxRouter = Router();

// Todas las rutas requieren autenticación
taxRouter.use(authenticate);

// GET /api/v1/tax/postal-code/:cp
taxRouter.get(
  '/postal-code/:cp',
  validate(postalCodeParamSchema),
  authorize('tax_entities', 'read'),
  getPostalCode,
);

// POST /api/v1/tax/validate-rfc
taxRouter.post(
  '/validate-rfc',
  validate(validateRFCSchema),
  authorize('tax_entities', 'read'),
  validateRFCHandler,
);