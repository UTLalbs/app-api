import type { Request, Response } from 'express';

import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../../shared/utils/auditContext';

import {
  closeReviewSession,
  getCurrentSessionForShift,
  getSession,
  listSessions,
} from './clock-review-session.service';
import {
  getPendingByTab,
  getTimeClockDay,
  listTimeClockDays,
  recalculateDay,
  resolveAnomaly,
  unresolveAnomaly,
} from './time-clock-day.service';
import { toTimeClockDay } from './time-clock-day.repository';
import {
  excludeEvent,
  getEvent,
  getMyClockStatus,
  getMyWidgetStatus,
  listActiveEmployees,
  listEvents,
  registerEvent,
  registerManualEvent,
  registerManualEventsBatch,
} from './time-clock.service';
import type {
  ActiveEmployeesInput,
  CloseSessionInput,
  CreateEventInput,
  CreateManualEventInput,
  CurrentSessionInput,
  ExcludeEventInput,
  ListDaysInput,
  ListEventsInput,
  ListSessionsInput,
  PendingByTabInput,
  ResolveAnomalyInput,
} from './time-clock.validator';
import { ObjectId } from 'mongodb';

function effectiveOrgId(req: Request): string {
  return req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';
}

function deviceFromReq(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

// ── Eventos ──────────────────────────────────────────────────────────────

export const createEventHandler = asyncHandler(
  async (req: Request & CreateEventInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    // userId es opcional en el body — si no viene, fichamos al usuario
    // autenticado. El service valida que si viene un id distinto, el
    // usuario tenga permiso 'correct'.
    const userId = req.body.userId ?? req.user!.id;
    const event = await registerEvent(
      req.user!,
      orgId,
      {
        userId,
        type: req.body.type,
        clockedAt: req.body.clockedAt,
        scheduleId: req.body.scheduleId,
        periodId: req.body.periodId,
        serviceCommitmentId: req.body.serviceCommitmentId,
        reportedLocation: req.body.reportedLocation,
        notes: req.body.notes,
      },
      deviceFromReq(req),
      'web',
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: event });
  },
);

export const createManualEventHandler = asyncHandler(
  async (req: Request & CreateManualEventInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const event = await registerManualEvent(
      req.user!,
      orgId,
      req.body,
      deviceFromReq(req),
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: event });
  },
);

export const createManualEventsBatchHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const events = await registerManualEventsBatch(
      req.user!,
      orgId,
      req.body,
      deviceFromReq(req),
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: events });
  },
);

export const listEventsHandler = asyncHandler(
  async (req: Request & ListEventsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const result = await listEvents(req.user!, orgId, {
      userId: req.query.userId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      type: req.query.type,
      reviewStatus: req.query.reviewStatus,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({
      success: true,
      data: result,
      meta: { page: req.query.page, pageSize: req.query.pageSize },
    });
  },
);

export const getEventHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const event = await getEvent(String(req.params.id), orgId);
    res.json({ success: true, data: event });
  },
);

export const excludeEventHandler = asyncHandler(
  async (req: Request & ExcludeEventInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const event = await excludeEvent(
      req.user!,
      String(req.params.id),
      orgId,
      req.body.exclusionReason,
      buildAuditContext(req),
    );
    res.json({ success: true, data: event });
  },
);

// ── Días agregados ───────────────────────────────────────────────────────

export const listDaysHandler = asyncHandler(
  async (req: Request & ListDaysInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const result = await listTimeClockDays(req.user!, orgId, {
      shiftDate: req.query.shiftDate,
      shiftDateFrom: req.query.shiftDateFrom,
      shiftDateTo: req.query.shiftDateTo,
      shiftPeriod: req.query.shiftPeriod,
      tab: req.query.tab,
      userId: req.query.userId,
      departmentKey: req.query.departmentKey,
      positionKey: req.query.positionKey,
      search: req.query.search,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({
      success: true,
      data: result,
      meta: { page: req.query.page, pageSize: req.query.pageSize },
    });
  },
);

export const getDayHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const day = await getTimeClockDay(String(req.params.id), orgId);
    res.json({ success: true, data: day });
  },
);

export const recalculateDayHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const day = await getTimeClockDay(String(req.params.id), orgId);
    // Vuelve a calcular y devuelve el agregado refrescado.
    const refreshed = await recalculateDay(
      new ObjectId(orgId),
      new ObjectId(day.userId),
      new Date(day.workDate),
    );
    res.json({ success: true, data: toTimeClockDay(refreshed) });
  },
);

// Materializa un Day virtual: recibe (userId, workDate) y dispara
//   1) tryMaterializeFromWorkSchedule — crea ScheduleAssignment desde el
//      workSchedule del empleado si no existe.
//   2) recalculateDay — crea el TimeClockDay con anomalías detectadas.
// Devuelve el Day con id real para que el frontend abra el drawer y permita
// resolver anomalías.
export const materializeVirtualDayHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new Error('Not authenticated');
    const orgId = effectiveOrgId(req);
    const userId = String(req.body?.userId ?? '');
    const workDateStr = String(req.body?.workDate ?? '');
    if (!ObjectId.isValid(userId) || !workDateStr) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'userId o workDate inválidos' },
      });
      return;
    }
    // workDate llega como ISO yyyy-mm-dd o ISO completo. Truncar a UTC midnight.
    const parsed = new Date(workDateStr);
    const workDate = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );

    // 1) Cargar empleado para denormalizar refs en el Assignment.
    const { getUserCollection } = await import('../../users/user.model');
    const userDoc = await getUserCollection().findOne(
      {
        _id: new ObjectId(userId),
        orgId: new ObjectId(orgId),
        deletedAt: null,
      },
      {
        projection: {
          _id: 1,
          displayName: 1,
          'employeeProfile.position': 1,
        },
      },
    );
    if (!userDoc) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Empleado no encontrado' },
      });
      return;
    }

    // 2) Crear Schedule desde el workSchedule del empleado (si aplica al día).
    // tryMaterializeFromWorkSchedule espera un instante real y lo localiza
    // al día del org. Si pasamos workDate UTC-midnight, la localización lo
    // manda al día anterior. Por eso pasamos noon UTC del workDate — un
    // instante que cae dentro del día local sin importar la timezone.
    const noonUtc = new Date(workDate.getTime() + 12 * 60 * 60_000);
    const { tryMaterializeFromWorkSchedule } = await import(
      './materialize.helpers'
    );
    await tryMaterializeFromWorkSchedule(
      orgId,
      userId,
      noonUtc,
      {
        id: userId,
        displayName: userDoc.displayName ?? '—',
        position: userDoc.employeeProfile?.position ?? null,
      },
      { id: req.user.id, displayName: req.user.displayName },
    );

    // 3) Crear/refrescar el Day y devolverlo.
    const created = await recalculateDay(
      new ObjectId(orgId),
      new ObjectId(userId),
      workDate,
    );
    res.json({ success: true, data: toTimeClockDay(created) });
  },
);

export const resolveAnomalyHandler = asyncHandler(
  async (req: Request & ResolveAnomalyInput, res: Response) => {
    const day = await resolveAnomaly(
      req.user!,
      String(req.params.id),
      String(req.params.anomalyId),
      {
        resolutionType: req.body.resolutionType,
        resolutionNotes: req.body.resolutionNotes,
        correctedClockedAt: req.body.correctedClockedAt,
        correctedLocationId: req.body.correctedLocationId,
      },
      buildAuditContext(req),
    );
    res.json({ success: true, data: day });
  },
);

export const unresolveAnomalyHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const day = await unresolveAnomaly(
      req.user!,
      String(req.params.id),
      String(req.params.anomalyId),
      buildAuditContext(req),
    );
    res.json({ success: true, data: day });
  },
);

// ── Página personal ──────────────────────────────────────────────────────

export const getMyTodayHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const status = await getMyClockStatus(req.user!, orgId);
    res.json({ success: true, data: status });
  },
);

export const getMyWidgetStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const status = await getMyWidgetStatus(req.user!, orgId);
    res.json({ success: true, data: status });
  },
);

// ── Sesiones de revisión ─────────────────────────────────────────────────

export const closeSessionHandler = asyncHandler(
  async (req: Request & CloseSessionInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const session = await closeReviewSession(
      req.user!,
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: session });
  },
);

export const getCurrentSessionHandler = asyncHandler(
  async (req: Request & CurrentSessionInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const session = await getCurrentSessionForShift(
      orgId,
      req.query.shiftDate,
      req.query.shiftPeriod,
    );
    res.json({ success: true, data: session });
  },
);

export const getSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const session = await getSession(String(req.params.id), orgId);
    res.json({ success: true, data: session });
  },
);

export const listSessionsHandler = asyncHandler(
  async (req: Request & ListSessionsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const result = await listSessions(orgId, {
      shiftDateFrom: req.query.shiftDateFrom,
      shiftDateTo: req.query.shiftDateTo,
      reviewedBy: req.query.reviewedBy,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({
      success: true,
      data: result,
      meta: { page: req.query.page, pageSize: req.query.pageSize },
    });
  },
);

// ── Helpers ──────────────────────────────────────────────────────────────

export const pendingByTabHandler = asyncHandler(
  async (req: Request & PendingByTabInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const data = await getPendingByTab(
      req.user!,
      orgId,
      req.query.shiftDate,
      req.query.shiftPeriod,
    );
    res.json({ success: true, data });
  },
);

export const activeEmployeesHandler = asyncHandler(
  async (req: Request & ActiveEmployeesInput, res: Response) => {
    void req.query; // filtros departmentKey/positionKey aún no aplicados
    const orgId = effectiveOrgId(req);
    const items = await listActiveEmployees(req.user!, orgId);
    res.json({ success: true, data: items, meta: { total: items.length } });
  },
);
