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
