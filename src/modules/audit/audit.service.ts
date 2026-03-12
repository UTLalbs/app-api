import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';

import { getAuditCollection } from './audit.model';
import type {
  AuditDocument,
  AuditEvent,
  AuditQueryFilter,
  CreateAuditDto,
} from './audit.types';

// ── Conversión ─────────────────────────────────────────────────────────────

function toAuditEvent(doc: AuditDocument): AuditEvent {
  return {
    id: doc._id.toHexString(),
    category: doc.category,
    action: doc.action,
    actor: doc.actor,
    target: doc.target,
    metadata: doc.metadata,
    ip: doc.ip,
    userAgent: doc.userAgent,
    orgId: doc.orgId?.toHexString(),
    createdAt: doc.createdAt,
  };
}

// ── Crear evento ───────────────────────────────────────────────────────────
// Fire-and-forget — nunca debe romper el flujo principal
// Los errores se loggean pero no se propagan

export async function createAuditEvent(dto: CreateAuditDto): Promise<void> {
  try {
    const doc: Omit<AuditDocument, '_id'> = {
      category: dto.category,
      action: dto.action,
      actor: dto.actor,
      target: dto.target,
      metadata: dto.metadata,
      ip: dto.ip,
      userAgent: dto.userAgent,
      orgId: dto.orgId ? new ObjectId(dto.orgId) : undefined,
      createdAt: new Date(),
    };

    await getAuditCollection().insertOne(doc as AuditDocument);
  } catch (err) {
    // El audit log nunca debe interrumpir el flujo principal
    logger.error({ err, action: dto.action }, 'Failed to write audit log');
  }
}

// ── Consultar eventos ──────────────────────────────────────────────────────

export async function queryAuditEvents(
  filter: AuditQueryFilter,
): Promise<{ events: AuditEvent[]; total: number }> {
  const {
    category,
    action,
    actorId,
    targetId,
    orgId,
    from,
    to,
    page = 1,
    limit = 50,
  } = filter;

  const query: Record<string, unknown> = {};

  if (category) query.category = category;
  if (action) query.action = action;
  if (actorId) query['actor.id'] = actorId;
  if (targetId) query['target.id'] = targetId;
  if (orgId) query.orgId = new ObjectId(orgId);

  if (from ?? to) {
    query.createdAt = {
      ...(from && { $gte: from }),
      ...(to && { $lte: to }),
    };
  }

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