import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';

import {
	createErrorReport,
	getErrorReports,
	updateErrorReportStatus,
} from './error-report.controller';
import {
  createErrorReportSchema,
  listErrorReportsSchema,
  updateErrorReportStatusSchema,
} from './error-report.validator';

export const errorReportRouter = Router();

// ── POST /api/v1/error-reports ─────────────────────────────────────────────
// Cualquier usuario autenticado puede reportar errores
errorReportRouter.post(
  '/',
  authenticate,
  validate(createErrorReportSchema),
  createErrorReport,
);

// ── GET /api/v1/error-reports ──────────────────────────────────────────────
// Solo super_admin
errorReportRouter.get(
  '/',
  authenticate,
  authorize('settings', 'read'),
  validate(listErrorReportsSchema),
  getErrorReports,
);

// ── PATCH /api/v1/error-reports/:id/status ────────────────────────────────
// Solo super_admin
errorReportRouter.patch(
  '/:id/status',
  authenticate,
  authorize('settings', 'update'),
  validate(updateErrorReportStatusSchema),
  updateErrorReportStatus,
);