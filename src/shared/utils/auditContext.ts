import type { Request } from 'express';

import type { AuditContext } from '../../modules/audit/audit.types';

// Construye el contexto de auditoría desde la request Express.
// Captura: actor (desde req.user), orgId, IP, userAgent, requestId, impersonation.
//
// Llamar en el controller y pasar el resultado al service.
// Los services NO deben depender de Express — por eso devolvemos un objeto plano.
export function buildAuditContext(req: Request): AuditContext {
  const user = req.user;

  if (!user) {
    // Se asume que este helper solo se llama después de authenticate middleware.
    // Si no hay user, devolvemos un contexto "system" para no romper el flujo.
    return {
      actor: null,
      orgId: null,
      ip: extractIp(req),
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
      impersonating: null,
    };
  }

  return {
    actor: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
    },
    orgId: user.impersonating?.orgId ?? user.orgId ?? null,
    ip: extractIp(req),
    userAgent: req.get('user-agent') ?? null,
    requestId: req.requestId,
    impersonating: user.impersonating ?? null,
  };
}

function extractIp(req: Request): string | null {
  // Express ya parsea X-Forwarded-For si trust proxy está activo.
  // Fallback: connection remoteAddress.
  return (
    req.ip ??
    req.socket?.remoteAddress ??
    null
  );
}

// Contexto de auditoría para acciones del sistema (jobs, seeds, cron).
// No tiene actor humano — el helper `emitAuditEvent` lo detecta y omite el evento.
// Se usa para mantener la misma firma en services que también son invocados por jobs.
export function systemAuditContext(sourceHint?: string): AuditContext {
  return {
    actor: null,
    orgId: null,
    ip: null,
    userAgent: null,
    requestId: sourceHint ?? 'system',
    impersonating: null,
  };
}
