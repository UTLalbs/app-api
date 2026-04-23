import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';

import {
  getActorActivity,
  getAuditEvent,
  getTargetActivity,
  getTimeline,
  getTopActors,
  listAuditEvents,
} from './audit.controller';
import {
  actorActivitySchema,
  auditIdParamSchema,
  listAuditEventsSchema,
  targetActivitySchema,
  timelineSchema,
  topActorsSchema,
} from './audit.validator';

export const auditRouter = Router();

// Todo el módulo de audit requiere autenticación + permiso `audit:read`.
auditRouter.use(authenticate);

// Orden: validate → authorize → controller.
auditRouter.get(
  '/events',
  validate(listAuditEventsSchema),
  authorize('audit', 'read'),
  listAuditEvents,
);

auditRouter.get(
  '/events/:id',
  validate(auditIdParamSchema),
  authorize('audit', 'read'),
  getAuditEvent,
);

auditRouter.get(
  '/actors/:actorId/activity',
  validate(actorActivitySchema),
  authorize('audit', 'read'),
  getActorActivity,
);

auditRouter.get(
  '/stats/top-actors',
  validate(topActorsSchema),
  authorize('audit', 'read'),
  getTopActors,
);

auditRouter.get(
  '/stats/timeline',
  validate(timelineSchema),
  authorize('audit', 'read'),
  getTimeline,
);

auditRouter.get(
  '/stats/target-activity',
  validate(targetActivitySchema),
  authorize('audit', 'read'),
  getTargetActivity,
);
