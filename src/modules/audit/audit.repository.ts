import { ObjectId } from 'mongodb';

import { getAuditCollection } from './audit.model';
import type {
  AuditDocument,
  AuditEvent,
  AuditQueryFilter,
} from './audit.types';

// ── Conversión ─────────────────────────────────────────────────────────────

function toAuditEvent(doc: AuditDocument): AuditEvent {
  return {
    id: doc._id.toHexString(),
    category: doc.category,
    action: doc.action,
    actor: {
      id: doc.actor.id.toHexString(),
      email: doc.actor.email,
      displayName: doc.actor.displayName,
    },
    target: doc.target
      ? {
          type: doc.target.type,
          id: doc.target.id.toHexString(),
          displayName: doc.target.displayName,
        }
      : undefined,
    diff: doc.diff,
    metadata: doc.metadata,
    ip: doc.ip,
    userAgent: doc.userAgent,
    orgId: doc.orgId?.toHexString(),
    requestId: doc.requestId,
    impersonating: doc.impersonating
      ? {
          orgId: doc.impersonating.orgId.toHexString(),
          orgName: doc.impersonating.orgName,
        }
      : undefined,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  };
}

// ── Consultas ──────────────────────────────────────────────────────────────

function toOidOrUndefined(id?: string): ObjectId | undefined {
  return id && ObjectId.isValid(id) ? new ObjectId(id) : undefined;
}

function buildQuery(filter: AuditQueryFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filter.category) query.category = filter.category;
  if (filter.action) query.action = filter.action;

  const actorOid = toOidOrUndefined(filter.actorId);
  if (actorOid) query['actor.id'] = actorOid;

  const targetOid = toOidOrUndefined(filter.targetId);
  if (targetOid) query['target.id'] = targetOid;

  if (filter.targetType) query['target.type'] = filter.targetType;

  const orgOid = toOidOrUndefined(filter.orgId);
  if (orgOid) query.orgId = orgOid;

  if (filter.from ?? filter.to) {
    query.createdAt = {
      ...(filter.from && { $gte: filter.from }),
      ...(filter.to && { $lte: filter.to }),
    };
  }

  return query;
}

export async function findAuditEvents(
  filter: AuditQueryFilter,
): Promise<{ events: AuditEvent[]; total: number }> {
  const query = buildQuery(filter);
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    getAuditCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    getAuditCollection().countDocuments(query),
  ]);

  return {
    events: docs.map((doc) => toAuditEvent(doc as AuditDocument)),
    total,
  };
}

export async function findAuditEventById(
  id: string,
): Promise<AuditEvent | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getAuditCollection().findOne({ _id: new ObjectId(id) });
  return doc ? toAuditEvent(doc as AuditDocument) : null;
}

// ── Agregaciones ───────────────────────────────────────────────────────────

export interface ActorActivity {
  actorId: string;
  actorEmail: string;
  actorDisplayName: string;
  total: number;
}

export async function aggregateTopActors(
  filter: Pick<AuditQueryFilter, 'from' | 'to' | 'category' | 'orgId'>,
  limit = 10,
): Promise<ActorActivity[]> {
  const match = buildQuery(filter);

  const docs = await getAuditCollection()
    .aggregate<{ _id: ObjectId; email: string; displayName: string; count: number }>([
      { $match: match },
      {
        $group: {
          _id: '$actor.id',
          email: { $first: '$actor.email' },
          displayName: { $first: '$actor.displayName' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ])
    .toArray();

  return docs.map((d) => ({
    actorId: d._id.toHexString(),
    actorEmail: d.email,
    actorDisplayName: d.displayName,
    total: d.count,
  }));
}

export interface TimelineBucket {
  bucket: string;    // ISO date string (day or hour)
  count: number;
}

export async function aggregateTimeline(
  filter: Pick<AuditQueryFilter, 'from' | 'to' | 'category' | 'action' | 'orgId'>,
  granularity: 'hour' | 'day',
): Promise<TimelineBucket[]> {
  const match = buildQuery(filter);
  const fmt = granularity === 'hour' ? '%Y-%m-%dT%H:00:00Z' : '%Y-%m-%d';

  const docs = await getAuditCollection()
    .aggregate<{ _id: string; count: number }>([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: fmt, date: '$createdAt', timezone: 'UTC' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return docs.map((d) => ({ bucket: d._id, count: d.count }));
}
