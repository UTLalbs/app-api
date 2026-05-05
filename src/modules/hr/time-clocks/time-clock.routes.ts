import { Router } from 'express';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import {
  activeEmployeesHandler,
  closeSessionHandler,
  createEventHandler,
  createManualEventHandler,
  createManualEventsBatchHandler,
  excludeEventHandler,
  getCurrentSessionHandler,
  getDayHandler,
  getEventHandler,
  getMyTodayHandler,
  getMyWidgetStatusHandler,
  getSessionHandler,
  listDaysHandler,
  listEventsHandler,
  listSessionsHandler,
  materializeVirtualDayHandler,
  pendingByTabHandler,
  recalculateDayHandler,
  resolveAnomalyHandler,
  unresolveAnomalyHandler,
} from './time-clock.controller';
import {
  activeEmployeesSchema,
  closeSessionSchema,
  createEventSchema,
  createManualEventSchema,
  createManualBatchSchema,
  currentSessionSchema,
  dayIdParamSchema,
  eventIdParamSchema,
  excludeEventSchema,
  listDaysSchema,
  listEventsSchema,
  listSessionsSchema,
  pendingByTabSchema,
  resolveAnomalySchema,
  sessionIdParamSchema,
} from './time-clock.validator';

export const timeClockRouter = Router();

timeClockRouter.use(authenticate);

// ── Página personal "Mi fichaje" — accesible para cualquier autenticado ──
// Antes de las rutas /events para evitar colisiones con /events/me/*.

timeClockRouter.get('/me/today', getMyTodayHandler);
timeClockRouter.get('/me/widget-status', getMyWidgetStatusHandler);

// ── Eventos ──────────────────────────────────────────────────────────────
// POST /events: el authorize de `read` o `correct` no aplica acá porque la
// regla "yo puedo fichar por mí mismo" la valida el service. Cualquier
// usuario autenticado puede entrar; el service rechaza si trata de fichar
// por otro sin permiso.

timeClockRouter.post('/events', validate(createEventSchema), createEventHandler);

timeClockRouter.post(
  '/events/manual',
  validate(createManualEventSchema),
  authorize('time_clocks', 'correct'),
  createManualEventHandler,
);

timeClockRouter.post(
  '/events/manual-batch',
  validate(createManualBatchSchema),
  authorize('time_clocks', 'correct'),
  createManualEventsBatchHandler,
);

timeClockRouter.get(
  '/events',
  validate(listEventsSchema),
  authorize('time_clocks', 'read'),
  listEventsHandler,
);

timeClockRouter.get(
  '/events/:id',
  validate(eventIdParamSchema),
  authorize('time_clocks', 'read'),
  getEventHandler,
);

timeClockRouter.patch(
  '/events/:id/exclude',
  validate(excludeEventSchema),
  authorize('time_clocks', 'exclude'),
  excludeEventHandler,
);

// ── Helpers (antes de /days y /review-sessions) ──────────────────────────

timeClockRouter.get(
  '/pending-by-tab',
  validate(pendingByTabSchema),
  authorize('time_clocks', 'read'),
  pendingByTabHandler,
);

timeClockRouter.get(
  '/active-employees',
  validate(activeEmployeesSchema),
  authorize('time_clocks', 'read'),
  activeEmployeesHandler,
);

// ── Días agregados ───────────────────────────────────────────────────────

timeClockRouter.get(
  '/days',
  validate(listDaysSchema),
  authorize('time_clocks', 'read'),
  listDaysHandler,
);

timeClockRouter.get(
  '/days/:id',
  validate(dayIdParamSchema),
  authorize('time_clocks', 'read'),
  getDayHandler,
);

timeClockRouter.post(
  '/days/:id/recalculate',
  validate(dayIdParamSchema),
  authorize('time_clocks', 'resolve'),
  recalculateDayHandler,
);

// Materializa un Day virtual a partir de (userId, workDate). Útil cuando el
// planner abre un row virtual en la página de fichajes y necesita un Day
// real (con anomalías persistidas) para resolver.
timeClockRouter.post(
  '/days/materialize',
  authorize('time_clocks', 'resolve'),
  materializeVirtualDayHandler,
);


timeClockRouter.post(
  '/days/:id/anomalies/:anomalyId/resolve',
  validate(resolveAnomalySchema),
  authorize('time_clocks', 'resolve'),
  resolveAnomalyHandler,
);

// Quita la resolución (vuelve a pending) — para deshacer un click erróneo.
timeClockRouter.post(
  '/days/:id/anomalies/:anomalyId/unresolve',
  authorize('time_clocks', 'resolve'),
  unresolveAnomalyHandler,
);

// ── Sesiones de revisión ─────────────────────────────────────────────────

timeClockRouter.get(
  '/review-sessions/current',
  validate(currentSessionSchema),
  authorize('time_clocks', 'resolve'),
  getCurrentSessionHandler,
);

timeClockRouter.post(
  '/review-sessions/close',
  validate(closeSessionSchema),
  authorize('time_clocks', 'resolve'),
  closeSessionHandler,
);

timeClockRouter.get(
  '/review-sessions',
  validate(listSessionsSchema),
  authorize('time_clocks', 'read'),
  listSessionsHandler,
);

timeClockRouter.get(
  '/review-sessions/:id',
  validate(sessionIdParamSchema),
  authorize('time_clocks', 'read'),
  getSessionHandler,
);
