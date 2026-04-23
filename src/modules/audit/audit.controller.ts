import type { Request, Response } from 'express';

import { NotFoundError } from '../../shared/errors/AppError';
import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  aggregateTimeline,
  aggregateTopActors,
  findAuditEventById,
  findAuditEvents,
} from './audit.repository';
import type {
  AuditAction,
  AuditCategory,
  AuditQueryFilter,
} from './audit.types';

// El middleware `validate` reemplaza req.query con los valores Zod-parseados,
// pero Express declara `req.query` como ParsedQs. Helper para leer sin casts repetidos.
function q<T>(req: Request, key: string): T | undefined {
  return (req.query as Record<string, unknown>)[key] as T | undefined;
}

// ── GET /api/v1/audit/events ───────────────────────────────────────────────

export const listAuditEvents = asyncHandler(
  async (req: Request, res: Response) => {
    const filter: AuditQueryFilter = {
      category: q<AuditCategory>(req, 'category'),
      action: q<AuditAction>(req, 'action'),
      actorId: q<string>(req, 'actorId'),
      targetId: q<string>(req, 'targetId'),
      targetType: q<string>(req, 'targetType'),
      orgId: q<string>(req, 'orgId'),
      from: q<Date>(req, 'from'),
      to: q<Date>(req, 'to'),
      page: q<number>(req, 'page'),
      limit: q<number>(req, 'limit'),
    };

    const { events, total } = await findAuditEvents(filter);
    res.json({ success: true, data: events, meta: { total } });
  },
);

// ── GET /api/v1/audit/events/:id ───────────────────────────────────────────

export const getAuditEvent = asyncHandler(
  async (req: Request, res: Response) => {
    const event = await findAuditEventById(String(req.params.id));
    if (!event) throw new NotFoundError('AuditEvent');
    res.json({ success: true, data: event });
  },
);

// ── GET /api/v1/audit/actors/:actorId/activity ─────────────────────────────

export const getActorActivity = asyncHandler(
  async (req: Request, res: Response) => {
    const { events, total } = await findAuditEvents({
      actorId: String(req.params.actorId),
      from: q<Date>(req, 'from'),
      to: q<Date>(req, 'to'),
      page: q<number>(req, 'page'),
      limit: q<number>(req, 'limit'),
    });

    res.json({ success: true, data: events, meta: { total } });
  },
);

// ── GET /api/v1/audit/stats/top-actors ─────────────────────────────────────

export const getTopActors = asyncHandler(
  async (req: Request, res: Response) => {
    const actors = await aggregateTopActors(
      {
        from: q<Date>(req, 'from'),
        to: q<Date>(req, 'to'),
        category: q<AuditCategory>(req, 'category'),
        orgId: q<string>(req, 'orgId'),
      },
      q<number>(req, 'limit') ?? 10,
    );

    res.json({ success: true, data: actors });
  },
);

// ── GET /api/v1/audit/stats/timeline ───────────────────────────────────────

export const getTimeline = asyncHandler(
  async (req: Request, res: Response) => {
    const buckets = await aggregateTimeline(
      {
        from: q<Date>(req, 'from'),
        to: q<Date>(req, 'to'),
        category: q<AuditCategory>(req, 'category'),
        action: q<AuditAction>(req, 'action'),
        orgId: q<string>(req, 'orgId'),
      },
      q<'hour' | 'day'>(req, 'granularity') ?? 'day',
    );

    res.json({ success: true, data: buckets });
  },
);

// ── GET /api/v1/audit/stats/target-activity ────────────────────────────────

export const getTargetActivity = asyncHandler(
  async (req: Request, res: Response) => {
    const { events, total } = await findAuditEvents({
      targetId: q<string>(req, 'targetId'),
      targetType: q<string>(req, 'targetType'),
      from: q<Date>(req, 'from'),
      to: q<Date>(req, 'to'),
      page: q<number>(req, 'page'),
      limit: q<number>(req, 'limit'),
    });

    res.json({ success: true, data: events, meta: { total } });
  },
);
