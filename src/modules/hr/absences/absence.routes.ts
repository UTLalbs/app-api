import { Router } from 'express';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import {
  activeOnDateHandler,
  approveAbsenceHandler,
  assignCoverageHandler,
  cancelAbsenceHandler,
  checkConflictsHandler,
  createAbsenceHandler,
  createCategoryHandler,
  deleteCategoryHandler,
  getAbsenceHandler,
  getBalanceHandler,
  getCategoryHandler,
  listAbsencesHandler,
  listBalancesHandler,
  listCategoriesHandler,
  recalculateBalanceHandler,
  rejectAbsenceHandler,
  updateAbsenceHandler,
  updateCategoryHandler,
} from './absence.controller';
import {
  absenceIdParamSchema,
  activeOnDateParamSchema,
  approveAbsenceSchema,
  assignCoverageSchema,
  cancelAbsenceSchema,
  categoryIdParamSchema,
  checkConflictsSchema,
  createAbsenceRequestSchema,
  createCategorySchema,
  listAbsenceRequestsSchema,
  listBalancesSchema,
  rejectAbsenceSchema,
  updateAbsenceRequestSchema,
  updateCategorySchema,
  userIdParamSchema,
} from './absence.validator';

export const absenceRouter = Router();

absenceRouter.use(authenticate);

// ── Categorías ────────────────────────────────────────────────────────────
// Sub-rutas /categories antes que /:id para evitar colisiones.

absenceRouter.get(
  '/categories',
  authorize('absence_categories', 'read'),
  listCategoriesHandler,
);

absenceRouter.post(
  '/categories',
  validate(createCategorySchema),
  authorize('absence_categories', 'update'),
  createCategoryHandler,
);

absenceRouter.get(
  '/categories/:id',
  validate(categoryIdParamSchema),
  authorize('absence_categories', 'read'),
  getCategoryHandler,
);

absenceRouter.patch(
  '/categories/:id',
  validate(updateCategorySchema),
  authorize('absence_categories', 'update'),
  updateCategoryHandler,
);

absenceRouter.delete(
  '/categories/:id',
  validate(categoryIdParamSchema),
  authorize('absence_categories', 'update'),
  deleteCategoryHandler,
);

// ── Helpers (antes de /:id) ───────────────────────────────────────────────

absenceRouter.get(
  '/conflicts/check',
  validate(checkConflictsSchema),
  authorize('absences', 'create'),
  checkConflictsHandler,
);

absenceRouter.get(
  '/active-on/:date',
  validate(activeOnDateParamSchema),
  authorize('absences', 'read'),
  activeOnDateHandler,
);

// ── Saldos ────────────────────────────────────────────────────────────────

absenceRouter.get(
  '/balances',
  validate(listBalancesSchema),
  authorize('absences', 'read'),
  listBalancesHandler,
);

absenceRouter.get(
  '/balances/:userId',
  validate(userIdParamSchema),
  authorize('absences', 'read'),
  getBalanceHandler,
);

absenceRouter.post(
  '/balances/:userId/recalculate',
  validate(userIdParamSchema),
  authorize('absences', 'approve'),
  recalculateBalanceHandler,
);

// ── Solicitudes ──────────────────────────────────────────────────────────

absenceRouter.get(
  '/',
  validate(listAbsenceRequestsSchema),
  authorize('absences', 'read'),
  listAbsencesHandler,
);

absenceRouter.post(
  '/',
  validate(createAbsenceRequestSchema),
  authorize('absences', 'create'),
  createAbsenceHandler,
);

absenceRouter.get(
  '/:id',
  validate(absenceIdParamSchema),
  authorize('absences', 'read'),
  getAbsenceHandler,
);

absenceRouter.patch(
  '/:id',
  validate(updateAbsenceRequestSchema),
  authorize('absences', 'update'),
  updateAbsenceHandler,
);

absenceRouter.post(
  '/:id/approve',
  validate(approveAbsenceSchema),
  authorize('absences', 'approve'),
  approveAbsenceHandler,
);

absenceRouter.post(
  '/:id/reject',
  validate(rejectAbsenceSchema),
  authorize('absences', 'approve'),
  rejectAbsenceHandler,
);

absenceRouter.post(
  '/:id/cancel',
  validate(cancelAbsenceSchema),
  authorize('absences', 'cancel'),
  cancelAbsenceHandler,
);

absenceRouter.post(
  '/:id/coverage',
  validate(assignCoverageSchema),
  authorize('absences', 'approve'),
  assignCoverageHandler,
);
