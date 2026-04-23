import { enqueueAuditEvent } from '../../infrastructure/jobs/audit.queue';

import type {
  AuditAction,
  AuditCategory,
  AuditContext,
  AuditDiff,
  AuditTarget,
  CreateAuditDto,
} from './audit.types';

// ── Crear evento ───────────────────────────────────────────────────────────
// Encola el evento en BullMQ. El worker (audit.worker.ts) lo persiste en Mongo
// con `expiresAt` calculado según la acción (retención corta vs larga).
//
// NUNCA propaga errores — si Redis cae, el evento se pierde pero el flujo sigue.
// `enqueueAuditEvent` ya atrapa y loguea fallas internamente.

export async function createAuditEvent(dto: CreateAuditDto): Promise<void> {
  await enqueueAuditEvent(dto);
}

// ── Helper para services ───────────────────────────────────────────────────
// Toma el AuditContext propagado desde el controller y construye el DTO completo.
// Si no hay `actor` en el contexto (sistema), se omite el evento — los eventos
// de sistema (seeds, jobs) deben usar `createAuditEvent` directo con actor sintético.

export async function emitAuditEvent(params: {
  category: AuditCategory;
  action: AuditAction;
  target?: AuditTarget;
  diff?: AuditDiff;
  metadata?: Record<string, unknown>;
  context: AuditContext;
}): Promise<void> {
  const { category, action, target, diff, metadata, context } = params;

  if (!context.actor) return;

  await createAuditEvent({
    category,
    action,
    actor: {
      id: context.actor.id,
      email: context.actor.email,
      displayName: context.actor.displayName,
    },
    target,
    diff,
    metadata,
    ip: context.ip,
    userAgent: context.userAgent,
    orgId: context.orgId,
    requestId: context.requestId,
    impersonating: context.impersonating,
  });
}

// Las consultas (`findAuditEvents`, `findAuditEventById`, agregaciones) viven en
// `audit.repository.ts` — importarlas desde ahí si se necesitan fuera del controller.