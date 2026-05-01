import { ObjectId } from 'mongodb';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';

import {
  findSessionById,
  findSessions,
  insertSession,
  toClockReviewSession,
} from './clock-review-session.repository';
import {
  computeReviewDeadline,
  computeShiftRange,
  startOfUtcDay,
} from './overtime.helpers';
import { findDaysInRange } from './time-clock-day.repository';
import { tagEventsWithSessionId } from './time-clock.repository';
import type {
  ClockReviewSession,
  CloseSessionDto,
  ListSessionsFilter,
  ResolutionsByType,
  ShiftPeriod,
  TimeClockDayDocument,
} from './time-clock.types';

// ── Helpers ───────────────────────────────────────────────────────────────

function countResolutionsByType(
  days: ReadonlyArray<TimeClockDayDocument>,
): ResolutionsByType {
  const counts: ResolutionsByType = {};
  for (const d of days) {
    for (const a of d.anomalies) {
      if (a.resolutionType) {
        counts[a.resolutionType] = (counts[a.resolutionType] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function buildSessionHumanReadableId(
  shiftDate: Date,
  shiftPeriod: ShiftPeriod,
): string {
  const y = shiftDate.getUTCFullYear();
  const m = String(shiftDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shiftDate.getUTCDate()).padStart(2, '0');
  return `REV-${y}-${m}-${d}-${shiftPeriod.toUpperCase()}`;
}

// ── Cerrar sesión ─────────────────────────────────────────────────────────

export async function closeReviewSession(
  user: AuthenticatedUser,
  orgId: string,
  input: CloseSessionDto,
  context: AuditContext,
): Promise<ClockReviewSession> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to close review session');
  }
  const canResolve =
    user.resolvedPermissions.time_clocks?.includes('resolve') ?? false;
  if (!canResolve) {
    throw new ForbiddenError('Sin permisos para cerrar sesiones de revisión');
  }

  // 1. Calcular rango del turno.
  const { start, end } = computeShiftRange(input.shiftDate, input.shiftPeriod);

  // 2. Verificar que no queden anomalías sin resolver. Bloqueamos el cierre
  //    para forzar al manager a tomar decisiones por cada caso.
  const pendingDays = await findDaysInRange(orgId, start, end, {
    pendingItemsCount: { $gt: 0 },
  });
  if (pendingDays.length > 0) {
    throw new ConflictError(
      `No se puede cerrar la revisión: ${pendingDays.length} fichaje(s) con anomalías sin resolver`,
    );
  }

  // 3. Snapshot de los días + eventos del rango.
  const allDays = await findDaysInRange(orgId, start, end);
  const totalEmployees = new Set(allDays.map((d) => d.userId.toHexString())).size;
  const totalAnomaliesResolved = allDays.reduce(
    (sum, d) => sum + d.anomalies.filter((a) => a.resolvedAt).length,
    0,
  );

  // 4. Calcular si es revisión retardada.
  const now = new Date();
  const deadline = computeReviewDeadline(input.shiftDate, input.shiftPeriod);
  const isLateReview = now > deadline;

  // 5. Crear sesión.
  const sessionId = new ObjectId();
  const session = await insertSession({
    _id: sessionId,
    orgId: new ObjectId(orgId),
    shiftDate: startOfUtcDay(input.shiftDate),
    shiftPeriod: input.shiftPeriod,
    reviewedBy: new ObjectId(user.id),
    // startedAt es informativo — sin tracking persistente lo dejamos = closedAt
    // por defecto. Si en el futuro queremos tracking real, agregar un evento
    // `review_session_opened` al primer GET de /pending-by-tab.
    startedAt: now,
    closedAt: now,
    totalEmployees,
    totalEventsReviewed: 0, // se actualiza tras tag de eventos
    totalPendingResolved: totalAnomaliesResolved,
    totalAnomaliesResolved,
    resolutionsByType: countResolutionsByType(allDays),
    notes: input.notes,
    isLateReview,
    llmSummary: null,
    humanReadableId: buildSessionHumanReadableId(
      input.shiftDate,
      input.shiftPeriod,
    ),
    createdAt: now,
  });

  // 6. Marcar eventos resueltos del rango con sessionId — quedan archivados.
  const taggedCount = await tagEventsWithSessionId(orgId, start, end, sessionId, [
    'resolved_ok',
    'resolved_action',
    'auto_ok',
  ]);

  // 7. Audit.
  await emitAuditEvent({
    category: 'time-clocks',
    action: 'review_session_closed',
    target: {
      type: 'clock_review_session',
      id: sessionId.toHexString(),
      displayName: session.humanReadableId ?? `${input.shiftPeriod}`,
    },
    metadata: {
      shiftDate: session.shiftDate.toISOString().slice(0, 10),
      shiftPeriod: input.shiftPeriod,
      totalEmployees,
      totalAnomaliesResolved,
      taggedEvents: taggedCount,
      isLateReview,
    },
    context,
  });

  return toClockReviewSession(session);
}

// ── Get / List ────────────────────────────────────────────────────────────

export async function getSession(
  id: string,
  orgId: string,
): Promise<ClockReviewSession> {
  const doc = await findSessionById(id, orgId);
  if (!doc) throw new NotFoundError('Sesión de revisión');
  return toClockReviewSession(doc);
}

export async function listSessions(
  orgId: string,
  filter: ListSessionsFilter,
): Promise<{ items: ClockReviewSession[]; total: number }> {
  const result = await findSessions(orgId, filter);
  return {
    items: result.items.map(toClockReviewSession),
    total: result.total,
  };
}

// "Sesión actual" — devuelve la última sesión cerrada del shift dado, o
// null si todavía no hay. Útil para que el frontend sepa si ya se cerró.
export async function getCurrentSessionForShift(
  orgId: string,
  shiftDate: Date,
  shiftPeriod: ShiftPeriod,
): Promise<ClockReviewSession | null> {
  const start = startOfUtcDay(shiftDate);
  const result = await findSessions(orgId, {
    shiftDateFrom: start,
    shiftDateTo: start,
    page: 0,
    pageSize: 10,
  });
  const match = result.items.find((s) => s.shiftPeriod === shiftPeriod);
  return match ? toClockReviewSession(match) : null;
}
