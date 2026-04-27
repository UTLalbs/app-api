import { Router } from 'express';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import {
  createAssignmentHandler,
  createTemplateHandler,
  deleteAssignmentHandler,
  deleteTemplateHandler,
  getAssignmentByIdHandler,
  getAssignmentsHandler,
  getConflictsHandler,
  getTemplateByIdHandler,
  getTemplatesHandler,
  updateAssignmentHandler,
  updateTemplateHandler,
} from './schedule.controller';
import {
  assignmentIdParamSchema,
  createAssignmentSchema,
  createTemplateSchema,
  listAssignmentsSchema,
  listConflictsSchema,
  listTemplatesSchema,
  templateIdParamSchema,
  updateAssignmentSchema,
  updateTemplateSchema,
} from './schedule.validator';

export const scheduleRouter = Router();

scheduleRouter.use(authenticate);

// ── Templates ─────────────────────────────────────────────────────────────

scheduleRouter.get(
  '/templates',
  validate(listTemplatesSchema),
  authorize('schedules', 'read'),
  getTemplatesHandler,
);

scheduleRouter.get(
  '/templates/:id',
  validate(templateIdParamSchema),
  authorize('schedules', 'read'),
  getTemplateByIdHandler,
);

scheduleRouter.post(
  '/templates',
  validate(createTemplateSchema),
  authorize('schedules', 'edit_shifts'),
  createTemplateHandler,
);

scheduleRouter.patch(
  '/templates/:id',
  validate(updateTemplateSchema),
  authorize('schedules', 'edit_shifts'),
  updateTemplateHandler,
);

scheduleRouter.delete(
  '/templates/:id',
  validate(templateIdParamSchema),
  authorize('schedules', 'edit_shifts'),
  deleteTemplateHandler,
);

// ── Conflicts (informativo, antes de la ruta /:id para evitar colisiones) ─

scheduleRouter.get(
  '/conflicts',
  validate(listConflictsSchema),
  authorize('schedules', 'read'),
  getConflictsHandler,
);

// ── Assignments ───────────────────────────────────────────────────────────

scheduleRouter.get(
  '/',
  validate(listAssignmentsSchema),
  authorize('schedules', 'read'),
  getAssignmentsHandler,
);

scheduleRouter.get(
  '/:id',
  validate(assignmentIdParamSchema),
  authorize('schedules', 'read'),
  getAssignmentByIdHandler,
);

scheduleRouter.post(
  '/',
  validate(createAssignmentSchema),
  authorize('schedules', 'edit_shifts'),
  createAssignmentHandler,
);

scheduleRouter.patch(
  '/:id',
  validate(updateAssignmentSchema),
  authorize('schedules', 'edit_shifts'),
  updateAssignmentHandler,
);

scheduleRouter.delete(
  '/:id',
  validate(assignmentIdParamSchema),
  authorize('schedules', 'edit_shifts'),
  deleteAssignmentHandler,
);
