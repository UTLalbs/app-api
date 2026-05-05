import { ObjectId, type Filter } from 'mongodb';

import { logger } from '../../../config/logger';
import { buildScopeFilter } from '../../../middleware/scope';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';
import { getLocationCollection } from '../../locations/location.model';
import { getOrgTimezone } from '../../organizations/organization.service';
import { getUserCollection } from '../../users/user.model';
import { findOverlappingForSchedule } from '../absences/absence.repository';
import { getScheduleAssignmentCollection } from '../schedules/schedule.model';
import { findAssignmentsByUserInRange } from '../schedules/schedule.repository';
import type {
  ScheduleAssignmentDocument,
  WorkPeriodDocument,
} from '../schedules/schedule.types';

import { detectAnomalies } from './anomaly-detector';
import { materializeAllForRange } from './materialize.helpers';
import { localDayUtcRange, workDateInTimezone } from './overtime.helpers';
import {
  buildShiftSummary,
  combineDateAndTimeInTimezone,
  endOfUtcDay,
  startOfUtcDay,
} from './overtime.helpers';
import {
  countDaysByStatus,
  findDayById,
  findDayByUserAndDate,
  findDays,
  toTimeClockDay,
  updateDay,
  upsertDay,
} from './time-clock-day.repository';
import { findEventsByUserInRange, updateEvent } from './time-clock.repository';
import type {
  ListDaysFilter,
  PendingByTabResponse,
  ServiceVisitSummaryDocument,
  ShiftPeriod,
  TimeClockAnomalyDocument,
  TimeClockDay,
  TimeClockDayDocument,
  TimeClockDayStatus,
  TimeClockEventDocument,
} from './time-clock.types';

// ── Service exports ──────────────────────────────────────────────────────

// Materializa y refresca los time_clock_days del rango.
//
// Estrategia: SIEMPRE llama recalculateDay para cada (userId, workDate) con
// schedule en el rango. Esto crea los days faltantes Y refresca los que ya
// existían (timezone, lateMinutes, anomalías) cuando cambian fixes del
// engine. Reemplaza al cron `detectMissingClockIns` durante MVP.
//
// Performance: paraleliza en batches para no saturar Mongo. Para una org
// de 200 empleados × 30 días = 6000 ops; tolerable mientras la página no
// se llame con polling agresivo.
export async function ensureDaysForRange(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<{ recomputed: number; failed: number }> {
  const schedules = await getScheduleAssignmentCollection()
    .find({
      orgId,
      deletedAt: null,
      workDate: { $gte: start, $lte: end },
    })
    .project<{ _id: ObjectId; userId: ObjectId; workDate: Date }>({
      _id: 1,
      userId: 1,
      workDate: 1,
    })
    .toArray();
  if (schedules.length === 0) return { recomputed: 0, failed: 0 };

  // Deduplicar por (userId, workDate) — si un empleado tiene varios
  // schedules el mismo día, recalculamos una sola vez.
  const uniqueKeys = new Set<string>();
  const work: Array<{ userId: ObjectId; workDate: Date }> = [];
  for (const s of schedules) {
    const key = `${s.userId.toHexString()}__${s.workDate.toISOString().slice(0, 10)}`;
    if (uniqueKeys.has(key)) continue;
    uniqueKeys.add(key);
    work.push({ userId: s.userId, workDate: s.workDate });
  }

  let recomputed = 0;
  let failed = 0;
  const BATCH = 25;
  for (let i = 0; i < work.length; i += BATCH) {
    const batch = work.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((w) => recalculateDay(orgId, w.userId, w.workDate)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') recomputed++;
      else {
        failed++;
        logger.warn({ reason: r.reason }, 'recalculateDay failed in ensureDaysForRange');
      }
    }
  }
  return { recomputed, failed };
}

export async function listTimeClockDays(
  user: AuthenticatedUser,
  orgId: string,
  filter: ListDaysFilter,
): Promise<{ items: TimeClockDay[]; total: number }> {
  // Resolver rango: prioriza shiftDateFrom/To (modo historial), cae a
  // shiftDate (un día) para la página de revisión por turno.
  const rangeStart = filter.shiftDateFrom
    ? startOfUtcDay(filter.shiftDateFrom)
    : filter.shiftDate
      ? startOfUtcDay(filter.shiftDate)
      : startOfUtcDay(new Date());
  const rangeEnd = filter.shiftDateTo
    ? endOfUtcDay(filter.shiftDateTo)
    : filter.shiftDate
      ? endOfUtcDay(filter.shiftDate)
      : endOfUtcDay(new Date());

  // Materializar Assignments faltantes desde workSchedule de cada empleado
  // en el rango. Sin esto, "Sin fichar" no muestra empleados con horario base
  // que aún no han fichaje'd ni abierto su app. Idempotente (skip si existe).
  await materializeAllForRange(orgId, rangeStart, rangeEnd, {
    id: user.id,
    displayName: user.displayName,
  });

  // Pre-genera days para schedules sin fichaje todavía. Idempotente.
  await ensureDaysForRange(new ObjectId(orgId), rangeStart, rangeEnd);

  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const result = await findDays(orgId, filter, scopeFilter, rangeStart, rangeEnd);
  return {
    items: result.items.map(toTimeClockDay),
    total: result.total,
  };
}

export async function getTimeClockDay(
  id: string,
  orgId: string,
): Promise<TimeClockDay> {
  const doc = await findDayById(id, orgId);
  if (!doc) throw new NotFoundError('Día de fichaje');
  return toTimeClockDay(doc);
}

export async function getPendingByTab(
  user: AuthenticatedUser,
  orgId: string,
  shiftDate: Date,
  shiftPeriod: ShiftPeriod,
): Promise<PendingByTabResponse> {
  const dayStart = startOfUtcDay(shiftDate);
  const dayEnd = endOfUtcDay(shiftDate);

  // Igual que listTimeClockDays — asegura que los counts reflejen los
  // schedules del día aunque nadie haya fichado aún.
  await ensureDaysForRange(new ObjectId(orgId), dayStart, dayEnd);

  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const counts = await countDaysByStatus(orgId, dayStart, dayEnd, scopeFilter);
  return {
    counts,
    shiftDate: shiftDate.toISOString().slice(0, 10),
    shiftPeriod,
  };
}

// ── Recálculo del día agregado ────────────────────────────────────────────

interface EmployeeMeta {
  id: ObjectId;
  displayName: string;
  position: string | null;
  managerId: string | null;
}

async function loadEmployee(
  orgId: ObjectId,
  userId: ObjectId,
): Promise<EmployeeMeta | null> {
  // Estricto: empleado activo en este org. Si falla, intentamos un fallback
  // relajado (sin deletedAt) para recuperar al menos el displayName cuando
  // un Day record referencia un usuario soft-deleted o despromovido.
  let doc = await getUserCollection().findOne(
    { _id: userId, orgId, deletedAt: null },
    {
      projection: {
        _id: 1,
        displayName: 1,
        'employeeProfile.position': 1,
        'employeeProfile.managerId': 1,
      },
    },
  );
  if (!doc) {
    doc = await getUserCollection().findOne(
      { _id: userId, orgId },
      {
        projection: {
          _id: 1,
          displayName: 1,
          'employeeProfile.position': 1,
          'employeeProfile.managerId': 1,
        },
      },
    );
  }
  if (!doc) return null;
  const rawManagerId = doc.employeeProfile?.managerId;
  const managerId =
    rawManagerId && ObjectId.isValid(rawManagerId as string | ObjectId)
      ? new ObjectId(rawManagerId as string | ObjectId).toHexString()
      : null;
  return {
    id: doc._id,
    displayName: doc.displayName,
    position: doc.employeeProfile?.position ?? null,
    managerId,
  };
}

// Construye el ServiceVisitSummary para un commitment del period a partir
// de los pares location_arrival/location_departure que matcheen.
function buildVisitsForPeriod(
  events: ReadonlyArray<TimeClockEventDocument>,
  schedule: ScheduleAssignmentDocument,
  period: WorkPeriodDocument,
  locationNames: Map<string, string>,
  orgTimezone: string,
): ServiceVisitSummaryDocument[] {
  const visits: ServiceVisitSummaryDocument[] = [];

  for (const commitment of period.serviceCommitments) {
    const arrivals = events.filter(
      (e) =>
        !e.isExcluded &&
        e.type === 'location_arrival' &&
        e.serviceCommitmentId &&
        e.serviceCommitmentId.equals(commitment._id),
    );
    const departures = events.filter(
      (e) =>
        !e.isExcluded &&
        e.type === 'location_departure' &&
        e.serviceCommitmentId &&
        e.serviceCommitmentId.equals(commitment._id),
    );
    const arrival = arrivals.sort(
      (a, b) => a.clockedAt.getTime() - b.clockedAt.getTime(),
    )[0];
    const departure = departures.sort(
      (a, b) => b.clockedAt.getTime() - a.clockedAt.getTime(),
    )[0];

    const expectedStart = combineDateAndTimeInTimezone(
      schedule.workDate,
      commitment.startTime,
      orgTimezone,
    );
    const expectedEnd = combineDateAndTimeInTimezone(
      schedule.workDate,
      commitment.endTime,
      orgTimezone,
    );

    const actualArrival = arrival?.clockedAt ?? null;
    const actualDeparture = departure?.clockedAt ?? null;

    let durationMinutes = 0;
    if (actualArrival && actualDeparture) {
      durationMinutes = Math.max(
        0,
        Math.round((actualDeparture.getTime() - actualArrival.getTime()) / 60_000),
      );
    }

    let arrivedOnTime: boolean | null = null;
    let delayMinutes = 0;
    if (actualArrival) {
      const delta = Math.round(
        (actualArrival.getTime() - expectedStart.getTime()) / 60_000,
      );
      delayMinutes = Math.max(0, delta);
      arrivedOnTime = delta <= commitment.arrivalTolerance;
    }

    let departedOnTime: boolean | null = null;
    if (actualDeparture) {
      departedOnTime = actualDeparture >= expectedEnd;
    }

    visits.push({
      commitmentId: commitment._id,
      locationId: commitment.locationId,
      locationName:
        locationNames.get(commitment.locationId.toHexString()) ?? '—',
      expectedStart,
      expectedEnd,
      actualArrival,
      actualDeparture,
      durationMinutes,
      arrivedOnTime,
      departedOnTime,
      delayMinutes,
      serviceCompleted: !!actualArrival && !!actualDeparture,
    });
  }

  return visits;
}

// Resolver locations referenciadas en commitments para denormalizar nombres.
async function loadLocationNames(
  orgId: ObjectId,
  locationIds: ObjectId[],
): Promise<Map<string, string>> {
  if (locationIds.length === 0) return new Map();
  const docs = await getLocationCollection()
    .find(
      {
        _id: { $in: locationIds },
        orgId,
        deletedAt: null,
      },
      { projection: { _id: 1, name: 1 } },
    )
    .toArray();
  const map = new Map<string, string>();
  for (const d of docs) map.set(d._id.toHexString(), d.name);
  return map;
}

// Determina el status agregado del día.
function determineDayStatus(args: {
  hasAbsence: boolean;
  schedule: ScheduleAssignmentDocument | null;
  events: ReadonlyArray<TimeClockEventDocument>;
  pendingItemsCount: number;
}): TimeClockDayStatus {
  if (args.hasAbsence) return 'absence';
  if (!args.schedule) return args.events.length === 0 ? 'no_schedule' : 'completed';
  const hasShiftStart = args.events.some((e) => e.type === 'shift_start');
  const hasShiftEnd = args.events.some((e) => e.type === 'shift_end');
  if (!hasShiftStart) return 'scheduled_no_clockin';
  if (hasShiftStart && !hasShiftEnd) return 'in_progress';
  return args.pendingItemsCount > 0 ? 'completed_with_issues' : 'completed';
}

// Helper público — recálculo idempotente del día agregado.
// Se llama tras crear/excluir/corregir un evento.
export async function recalculateDay(
  orgId: ObjectId,
  userId: ObjectId,
  date: Date,
): Promise<TimeClockDayDocument> {
  const now = new Date();

  // Timezone de la org — necesaria para reconstruir los horarios esperados
  // del schedule ("07:00" wall clock → instante UTC respetando UTC-6/UTC-5).
  const orgTimezone = await getOrgTimezone(orgId.toHexString());

  // El parámetro `date` puede venir como:
  //   (a) un workDate (UTC-midnight que representa un día local)  — desde
  //       ensureDaysForRange iterando schedules.workDate.
  //   (b) un instante real (ej. clockedAt de un evento) — desde registerEvent.
  // Si `date` ya es UTC-midnight, lo respetamos (caso a). Si tiene hora,
  // calculamos el workDate del día local que lo contiene (caso b).
  const isAlreadyWorkDate =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  const dayStart = isAlreadyWorkDate
    ? date
    : workDateInTimezone(date, orgTimezone);
  const { start: localStart, end: localEnd } = localDayUtcRange(dayStart, orgTimezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000 - 1);

  const employee = await loadEmployee(orgId, userId);

  // 1. Eventos del día (excluyendo los marcados isExcluded).
  // Filtramos por el rango de instantes UTC que caen en el día local —
  // un evento a las 6:30 PM Mexico (00:30 UTC del día siguiente) pertenece
  // al workDate de Mexico, no al UTC del clockedAt.
  const events = await findEventsByUserInRange(
    orgId.toHexString(),
    userId.toHexString(),
    localStart,
    localEnd,
    { includeExcluded: false },
  );

  // 2. Schedule del día (puede haber 0, 1 o varios — tomamos el primero).
  // Schedules se persisten con workDate UTC-midnight, así que el rango
  // [dayStart, dayEnd] sobre UTC es lo correcto aquí.
  const schedules = await findAssignmentsByUserInRange(
    orgId.toHexString(),
    userId.toHexString(),
    dayStart,
    dayEnd,
  );
  const schedule = schedules[0] ?? null;
  const period = schedule?.periods[0] ?? null;

  // 3. ¿Hay ausencia aprobada vigente?
  const overlappingAbsences = await findOverlappingForSchedule(
    orgId.toHexString(),
    userId.toHexString(),
    dayStart,
  );
  const hasApprovedAbsence = overlappingAbsences.some((a) => a.status === 'approved');

  // 4. Resolver nombres de locations referenciadas (commitments + period).
  const locationIdsSet = new Set<string>();
  if (period) {
    locationIdsSet.add(period.startLocationId.toHexString());
    locationIdsSet.add(period.endLocationId.toHexString());
    for (const c of period.serviceCommitments) {
      locationIdsSet.add(c.locationId.toHexString());
    }
  }
  const locationNames = await loadLocationNames(
    orgId,
    [...locationIdsSet].map((id) => new ObjectId(id)),
  );

  // 5. Construir shift summary. expectedStart/End respetan la timezone
  //    de la org y `now` permite que jornadas en progreso muestren minutos
  //    acumulados sin esperar al shift_end.
  const expectedStart = period
    ? combineDateAndTimeInTimezone(schedule!.workDate, period.startTime, orgTimezone)
    : null;
  const expectedEnd = period
    ? combineDateAndTimeInTimezone(schedule!.workDate, period.endTime, orgTimezone)
    : null;
  const shift = buildShiftSummary({ events, expectedStart, expectedEnd, now });

  // 6. Construir service visits.
  const serviceVisits = period && schedule
    ? buildVisitsForPeriod(events, schedule, period, locationNames, orgTimezone)
    : [];
  const totalServiceMinutes = serviceVisits.reduce(
    (sum, v) => sum + v.durationMinutes,
    0,
  );

  // 7. Detectar anomalías. Match por (type, affectedEventId) y preservar
  //    el _id estable de la anomalía existente — esto evita que un cliente
  //    con la anomalía abierta en un drawer falle al resolver porque el
  //    _id cambió en un recálculo intermedio.
  const existing = await findDayByUserAndDate(
    orgId.toHexString(),
    userId.toHexString(),
    dayStart,
  );
  const previousAll = existing?.anomalies ?? [];

  const fresh = detectAnomalies({
    events,
    schedule,
    period,
    shift,
    serviceVisits,
    orgTimezone,
    now,
  });

  function matches(
    a: TimeClockAnomalyDocument,
    b: TimeClockAnomalyDocument,
  ): boolean {
    if (a.type !== b.type) return false;
    if (!a.affectedEventId && !b.affectedEventId) return true;
    if (a.affectedEventId && b.affectedEventId) {
      return a.affectedEventId.equals(b.affectedEventId);
    }
    return false;
  }

  const merged: TimeClockAnomalyDocument[] = fresh.map((newAnomaly) => {
    const matched = previousAll.find((p) => matches(p, newAnomaly));
    if (!matched) return newAnomaly;
    if (matched.resolvedAt) {
      // Anomalía resuelta — conservamos toda la resolución (incluido _id).
      return matched;
    }
    // Pendiente — solo preservamos _id para que las refs del frontend
    // sigan siendo válidas. Los campos descriptivos se actualizan al
    // valor recién calculado (descripción, severidad, etc).
    return { ...newAnomaly, _id: matched._id };
  });

  const pendingItemsCount = merged.filter((a) => !a.resolvedAt).length;

  const status = determineDayStatus({
    hasAbsence: hasApprovedAbsence,
    schedule,
    events,
    pendingItemsCount,
  });

  // 8. Upsert del documento (reusamos `now` declarado al inicio).
  const newId = existing?._id ?? new ObjectId();
  const humanReadableId =
    existing?.humanReadableId ??
    `TCD-${dayStart.toISOString().slice(0, 10)}-${newId.toHexString().slice(-4).toUpperCase()}`;

  const doc: TimeClockDayDocument = {
    _id: newId,
    orgId,
    userId,
    workDate: dayStart,
    scheduleId: schedule?._id ?? null,
    status,
    events: events.map((e) => e._id),
    shift,
    serviceVisits,
    totalServiceMinutes,
    anomalies: merged,
    reviewStatus: pendingItemsCount > 0 ? 'pending' : 'auto_ok',
    pendingItemsCount,
    llmSummary: null,
    humanReadableId,
    denormalizedRefs: {
      userName: employee?.displayName ?? '—',
      userPosition: employee?.position ?? null,
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return upsertDay(doc);
}

// ── Resolver una anomalía ─────────────────────────────────────────────────

export interface ResolveAnomalyPayload {
  resolutionType: import('./time-clock.types').ResolutionType;
  resolutionNotes: string | null;
  correctedClockedAt: Date | null;
  correctedLocationId: string | null;
}

export async function resolveAnomaly(
  user: AuthenticatedUser,
  dayId: string,
  anomalyId: string,
  payload: ResolveAnomalyPayload,
  context: AuditContext,
): Promise<TimeClockDay> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to resolve anomaly');
  }
  const day = await findDayById(dayId, user.orgId ?? '');
  if (!day) throw new NotFoundError('Día de fichaje');

  const anomaly = day.anomalies.find((a) => a._id.equals(anomalyId));
  if (!anomaly) throw new NotFoundError('Anomalía');
  if (anomaly.resolvedAt) {
    throw new ConflictError('Esta anomalía ya estaba resuelta');
  }

  // Si la resolución es 'event_excluded' y hay affectedEventId, marcar el
  // evento como excluido en consecuencia. El service de events ya tiene
  // su propia función pero acá cerramos el loop coordinado.
  if (
    payload.resolutionType === 'event_excluded' &&
    anomaly.affectedEventId
  ) {
    await updateEvent(anomaly.affectedEventId.toHexString(), day.orgId.toHexString(), {
      isExcluded: true,
      excludedBy: new ObjectId(user.id),
      excludedAt: new Date(),
      exclusionReason: payload.resolutionNotes ?? 'Excluido al resolver anomalía',
    });
  }

  // Mutamos la anomalía dentro del array.
  const nextAnomalies = day.anomalies.map((a) =>
    a._id.equals(anomalyId)
      ? {
          ...a,
          resolvedAt: new Date(),
          resolvedBy: new ObjectId(user.id),
          resolutionType: payload.resolutionType,
          resolutionNotes: payload.resolutionNotes,
        }
      : a,
  );
  const pending = nextAnomalies.filter((a) => !a.resolvedAt).length;

  // El status puede transitar de "completed_with_issues" a "completed".
  let nextStatus = day.status;
  if (
    day.status === 'completed_with_issues' &&
    pending === 0 &&
    day.shift.actualStart &&
    day.shift.actualEnd
  ) {
    nextStatus = 'completed';
  }

  const updated = await updateDay(dayId, day.orgId.toHexString(), {
    anomalies: nextAnomalies,
    pendingItemsCount: pending,
    reviewStatus: pending > 0 ? 'pending' : 'resolved_ok',
    status: nextStatus,
  });
  if (!updated) throw new NotFoundError('Día de fichaje');

  // Si la resolución requiere también recalcular (manual_correction puede
  // alterar shift duration), lo dejamos al caller por ahora — generalmente
  // basta con la mutación de la anomalía.
  if (payload.resolutionType === 'manual_correction' && payload.correctedClockedAt) {
    logger.info(
      { dayId, anomalyId },
      'Resolución manual_correction registrada — el caller debe llamar createManualEvent',
    );
  }

  await emitAuditEvent({
    category: 'time-clocks',
    action: 'anomaly_resolved',
    target: {
      type: 'time_clock_day',
      id: dayId,
      displayName:
        updated.humanReadableId ??
        `${updated.denormalizedRefs.userName} · ${updated.workDate.toISOString().slice(0, 10)}`,
    },
    metadata: {
      anomalyType: anomaly.type,
      resolutionType: payload.resolutionType,
    },
    context,
  });

  return toTimeClockDay(updated);
}

