import { ObjectId, type Filter } from 'mongodb';

import { logger } from '../../../config/logger';
import { buildScopeFilter } from '../../../middleware/scope';
import {
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

import type { DayOfWeek } from '../employees/employee.types';
import { findTemplateById } from '../schedules/schedule.repository';

import { detectAnomalies } from './anomaly-detector';
import {
  buildShiftSummary,
  combineDateAndTimeInTimezone,
  endOfUtcDay,
  formatMinutesAsHours,
  localDayUtcRange,
  startOfUtcDay,
  workDateInTimezone,
} from './overtime.helpers';
import {
  countDaysByStatus,
  findDayById,
  findDayByUserAndDate,
  findDays,
  findDaysInRange,
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
  TimeClockAnomaly,
  TimeClockAnomalyDocument,
  TimeClockDay,
  TimeClockDayDocument,
  TimeClockDayStatus,
  TimeClockEventDocument,
} from './time-clock.types';

// ── Service exports ──────────────────────────────────────────────────────

// Refresca los time_clock_days EXISTENTES del rango.
//
// Itera Days que ya están en BD y los recalcula (timezone, lateMinutes,
// anomalías) por si cambió algún fix del engine. NO crea Days nuevos —
// la creación se da on-event (registerEvent → recalculateDay) o on-edit
// (manual entry, anomaly resolve). Para mostrar "Sin fichar" sin Day
// real, ver buildVirtualMissingDays más abajo.
export async function ensureDaysForRange(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<{ recomputed: number; failed: number }> {
  const existing = await findDaysInRange(orgId.toHexString(), start, end);
  if (existing.length === 0) return { recomputed: 0, failed: 0 };

  let recomputed = 0;
  let failed = 0;
  const BATCH = 25;
  for (let i = 0; i < existing.length; i += BATCH) {
    const batch = existing.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((d) => recalculateDay(orgId, d.userId, d.workDate)),
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

  // Refrescar Days reales existentes (status, anomalías recalculadas) sin
  // crear nuevos. Esto es seguro y útil — solo toca docs ya en BD.
  await ensureDaysForRange(new ObjectId(orgId), rangeStart, rangeEnd);

  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const result = await findDays(orgId, filter, scopeFilter, rangeStart, rangeEnd);
  const realItems = result.items.map(toTimeClockDay);

  // Para tabs que muestran "sin fichar" o "all", inyectar Days virtuales
  // derivados del workSchedule — empleados con patrón pero sin Day real
  // en BD. Para dedup correcto, usamos TODOS los Days en rango (no solo
  // los filtrados por tab), si no, un empleado con Day en otro status
  // seguiría generando un virtual duplicado.
  let virtualItems: TimeClockDay[] = [];
  if (filter.tab === 'missing_clockin' || filter.tab === 'all' || !filter.tab) {
    const allDaysInRange = await findDaysInRange(
      orgId,
      rangeStart,
      rangeEnd,
      scopeFilter as Filter<TimeClockDayDocument>,
    );
    virtualItems = await buildVirtualMissingDays(
      orgId,
      rangeStart,
      rangeEnd,
      scopeFilter,
      allDaysInRange,
    );
  }

  // Merge + paginate en memoria (los virtuales no están en BD).
  const merged = [...realItems, ...virtualItems].sort((a, b) => {
    if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
    return a.denormalizedRefs.userName.localeCompare(b.denormalizedRefs.userName);
  });
  const start = filter.page * filter.pageSize;
  const paged = merged.slice(start, start + filter.pageSize);

  return { items: paged, total: merged.length };
}

// ── Virtual Days (no persistidos) ─────────────────────────────────────────
//
// Construye TimeClockDay sintéticos para empleados con workSchedule fixed
// que tienen pattern para el día pero NO Day real en BD. Permite mostrar
// "Sin fichar" sin escribir en time_clock_days. El día se materializa solo
// cuando llega un fichaje, se edita manualmente o se resuelve algo.

const JS_DAY_TO_NAME_LOCAL: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

async function buildVirtualMissingDays(
  orgId: string,
  rangeStart: Date,
  rangeEnd: Date,
  scopeFilter: Record<string, unknown>,
  existingDays: ReadonlyArray<TimeClockDayDocument>,
): Promise<TimeClockDay[]> {
  const orgTimezone = await getOrgTimezone(orgId);

  // Set de (userId, workDate) ya cubiertos por Days reales.
  const existingKey = new Set<string>();
  for (const d of existingDays) {
    existingKey.add(`${d.userId.toHexString()}::${d.workDate.toISOString().slice(0, 10)}`);
  }

  // Set de (userId, workDate) cubiertos por ausencias aprobadas/pendientes
  // — esos días aparecen en tab "Ausencias", no en "Sin fichar".
  const { getAbsenceRequestCollection } = await import('../absences/absence.model');
  const absences = await getAbsenceRequestCollection()
    .find({
      orgId: new ObjectId(orgId),
      status: { $in: ['approved', 'pending'] },
      deletedAt: null,
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart },
    })
    .project<{ userId: ObjectId; startDate: Date; endDate: Date }>({
      userId: 1,
      startDate: 1,
      endDate: 1,
    })
    .toArray();
  const absenceKey = new Set<string>();
  for (const a of absences) {
    const start = new Date(Math.max(a.startDate.getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(a.endDate.getTime(), rangeEnd.getTime()));
    const cur = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    while (cur <= last) {
      absenceKey.add(`${a.userId.toHexString()}::${cur.toISOString().slice(0, 10)}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Empleados activos con workSchedule fixed dentro del scope del actor.
  const employees = (await getUserCollection()
    .find(
      {
        orgId: new ObjectId(orgId),
        deletedAt: null,
        'employeeProfile.isEmployee': true,
        'employeeProfile.workSchedule.mode': 'fixed',
        ...(scopeFilter as Filter<unknown>),
      },
      {
        projection: {
          _id: 1,
          displayName: 1,
          'employeeProfile.position': 1,
          'employeeProfile.workSchedule': 1,
        },
      },
    )
    .toArray()) as Array<{
    _id: ObjectId;
    displayName?: string;
    employeeProfile?: {
      position?: string | null;
      workSchedule?: {
        mode: string;
        templateId?: ObjectId | string | null;
        customPattern?: Record<DayOfWeek, unknown> | null;
        restDays?: DayOfWeek[];
      };
    };
  }>;

  if (employees.length === 0) return [];

  // Cache de templates para no re-fetchearlos por empleado.
  const templateCache = new Map<string, Awaited<ReturnType<typeof findTemplateById>>>();

  const virtuals: TimeClockDay[] = [];

  for (const emp of employees) {
    const ws = emp.employeeProfile?.workSchedule;
    if (!ws) continue;

    // rangeStart/rangeEnd ya son workDates (UTC-midnight de un día local).
    // Iteramos UTC-days y cada cursor ES el workDate del día — NO aplicar
    // workDateInTimezone aquí porque mete el cursor al día anterior cuando
    // está en UTC-midnight.
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const workDate = new Date(Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
      ));
      const dayName = JS_DAY_TO_NAME_LOCAL[workDate.getUTCDay()];

      // Skip rest days
      if (ws.restDays?.includes(dayName)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // Skip si ya hay Day real
      const key = `${emp._id.toHexString()}::${workDate.toISOString().slice(0, 10)}`;
      if (existingKey.has(key)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // Skip si hay ausencia aprobada/pendiente — la fila vive en tab Ausencias
      if (absenceKey.has(key)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // Resolver shift del día
      let shift:
        | { startTime: string; endTime: string; multiDay?: boolean; endDayOffset?: number }
        | null = null;
      let startLocationIdHex: string | null = null;
      const cp = ws.customPattern as
        | Record<DayOfWeek, {
            startTime: string;
            endTime: string;
            multiDay?: boolean;
            endDayOffset?: number;
            startLocationId?: ObjectId | string | null;
          } | null>
        | null
        | undefined;
      if (cp && cp[dayName]) {
        const dayShift = cp[dayName]!;
        shift = dayShift;
        if (dayShift.startLocationId) {
          startLocationIdHex =
            dayShift.startLocationId instanceof ObjectId
              ? dayShift.startLocationId.toHexString()
              : String(dayShift.startLocationId);
        }
      } else if (ws.templateId) {
        const tplId =
          ws.templateId instanceof ObjectId
            ? ws.templateId.toHexString()
            : String(ws.templateId);
        let tpl = templateCache.get(tplId);
        if (tpl === undefined) {
          tpl = await findTemplateById(tplId, orgId);
          templateCache.set(tplId, tpl);
        }
        if (tpl) {
          shift = {
            startTime: tpl.defaultStartTime,
            endTime: tpl.defaultEndTime,
          };
          if (tpl.defaultStartLocationId) {
            startLocationIdHex = String(tpl.defaultStartLocationId);
          }
        }
      }

      if (!shift) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // Calcular expectedStart/expectedEnd en UTC respetando timezone
      const expectedStart = combineDateAndTimeInTimezone(
        workDate,
        shift.startTime,
        orgTimezone,
      );
      const expectedEnd = combineDateAndTimeInTimezone(
        workDate,
        shift.endTime,
        orgTimezone,
      );

      // Anomalía virtual: si ya pasó la hora esperada, marcar
      // shift_missing_clockin (mismo formato que anomaly-detector).
      const now = new Date();
      const virtualAnomalies: TimeClockAnomaly[] = [];
      if (now > expectedStart) {
        const minutesLate = Math.round(
          (now.getTime() - expectedStart.getTime()) / 60_000,
        );
        virtualAnomalies.push({
          id: `virtual-anomaly-${emp._id.toHexString()}-${workDate.toISOString().slice(0, 10)}`,
          type: 'shift_missing_clockin',
          severity: minutesLate > 60 ? 'critical' : 'warning',
          description: `Sin fichaje de entrada · ${formatMinutesAsHours(minutesLate)} desde la hora esperada`,
          affectsRole: ['rrhh'],
          affectedEventId: null,
          affectedLocationId: null,
          detectedAt: now,
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
        });
      }

      // Si el shift trae location, exponerla como visita "esperada" para
      // que el frontend prerellene el dropdown del modal de captura.
      const virtualVisits = startLocationIdHex
        ? [
            {
              commitmentId: null,
              locationId: startLocationIdHex,
              locationName: '',
              expectedStart,
              expectedEnd,
              actualArrival: null,
              actualDeparture: null,
              durationMinutes: 0,
              arrivedOnTime: null,
              departedOnTime: null,
              delayMinutes: 0,
              serviceCompleted: false,
            },
          ]
        : [];

      virtuals.push({
        // ID sintético — el frontend reconoce __virtual y deshabilita
        // navegaciones que requerirían un ObjectId real.
        id: `virtual-${emp._id.toHexString()}-${workDate.toISOString().slice(0, 10)}`,
        orgId,
        userId: emp._id.toHexString(),
        workDate: workDate.toISOString().slice(0, 10),
        scheduleId: null,
        status: 'scheduled_no_clockin',
        events: [],
        shift: {
          expectedStart,
          expectedEnd,
          actualStart: null,
          actualEnd: null,
          durationMinutes: 0,
          regularMinutes: 0,
          overtime100Minutes: 0,
          overtime200Minutes: 0,
          holidayMinutes: 0,
          breakMinutes: 0,
          mealMinutes: 0,
          isLate: false,
          lateMinutes: 0,
          isEarlyLeave: false,
          earlyLeaveMinutes: 0,
        },
        serviceVisits: virtualVisits,
        totalServiceMinutes: 0,
        anomalies: virtualAnomalies,
        reviewStatus: virtualAnomalies.length > 0 ? 'pending' : 'auto_ok',
        pendingItemsCount: virtualAnomalies.length,
        llmSummary: null,
        humanReadableId: null,
        denormalizedRefs: {
          userName: emp.displayName ?? '—',
          userPosition: emp.employeeProfile?.position ?? null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        __virtual: true,
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return virtuals;
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

  // Refrescar Days reales sin crear nuevos (no materialize aquí).
  await ensureDaysForRange(new ObjectId(orgId), dayStart, dayEnd);

  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const counts = await countDaysByStatus(orgId, dayStart, dayEnd, scopeFilter);

  // Sumar Days virtuales al count de missing_clockin — empleados con
  // workSchedule sin fichaje todavía pero sin Day persistido.
  const realDays = await findDaysInRange(
    orgId,
    dayStart,
    dayEnd,
    scopeFilter as Filter<TimeClockDayDocument>,
  );
  const virtuals = await buildVirtualMissingDays(
    orgId,
    dayStart,
    dayEnd,
    scopeFilter,
    realDays,
  );
  counts.missing_clockin = (counts.missing_clockin ?? 0) + virtuals.length;

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
  anomalies: ReadonlyArray<TimeClockAnomalyDocument>;
}): TimeClockDayStatus {
  if (args.hasAbsence) return 'absence';
  // Si una anomalía shift_missing_clockin se resolvió como absence_*,
  // el día se considera ausencia (movido al tab Ausencias).
  const resolvedAsAbsence = args.anomalies.some(
    (a) =>
      a.type === 'shift_missing_clockin' &&
      a.resolvedAt &&
      (a.resolutionType === 'absence_justified' ||
        a.resolutionType === 'absence_unjustified'),
  );
  if (resolvedAsAbsence) return 'absence';
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

  // CONTRATO: `date` debe ser un workDate (UTC-midnight que representa un
  // día local). Las callers (registerEvent, ensureDaysForRange, etc.)
  // normalizan vía workDateInTimezone() antes de invocar. Aquí solo
  // truncamos como safety net.
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
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
  let serviceVisits = period && schedule
    ? buildVisitsForPeriod(events, schedule, period, locationNames, orgTimezone)
    : [];
  // Fallback: schedules con startLocationId pero sin serviceCommitments
  // (fixed schedule simple). Exponemos una visita "esperada" con la
  // ubicación del shift para que el modal de captura sepa qué location
  // pre-rellenar y qué locations son válidas.
  if (
    serviceVisits.length === 0 &&
    period &&
    expectedStart &&
    expectedEnd
  ) {
    serviceVisits = [
      {
        commitmentId: null,
        locationId: period.startLocationId,
        locationName:
          locationNames.get(period.startLocationId.toHexString()) ?? '—',
        expectedStart,
        expectedEnd,
        actualArrival: null,
        actualDeparture: null,
        durationMinutes: 0,
        arrivedOnTime: null,
        departedOnTime: null,
        delayMinutes: 0,
        serviceCompleted: false,
      },
    ];
  }
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
    anomalies: merged,
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
  // Permitimos sobrescribir una resolución existente — el manager pudo
  // haberse equivocado al elegir el tipo. Auditamos cada cambio.

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

  // Recompute status post-resolución:
  //   - 'absence' si shift_missing_clockin se resolvió como absence_*
  //   - revertir 'absence' → 'scheduled_no_clockin' si cambian a otro tipo
  //   - 'completed' si veníamos de 'completed_with_issues' y ya no hay pendientes
  let nextStatus = day.status;
  const missingClockinResolvedAsAbsence = nextAnomalies.some(
    (a) =>
      a.type === 'shift_missing_clockin' &&
      a.resolvedAt &&
      (a.resolutionType === 'absence_justified' ||
        a.resolutionType === 'absence_unjustified'),
  );
  const hasShiftStartEvent = day.shift.actualStart != null;
  if (missingClockinResolvedAsAbsence) {
    nextStatus = 'absence';
  } else if (day.status === 'absence' && !hasShiftStartEvent) {
    // Veníamos de 'absence' (por la resolución previa) y ya no aplica.
    // Sin eventos de fichaje → vuelve a sin fichaje.
    nextStatus = 'scheduled_no_clockin';
  } else if (
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

// Quita la resolución de una anomalía — vuelve al estado pendiente.
// Útil cuando el manager se equivoca y quiere reabrir la anomalía.
export async function unresolveAnomaly(
  user: AuthenticatedUser,
  dayId: string,
  anomalyId: string,
  context: AuditContext,
): Promise<TimeClockDay> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to unresolve anomaly');
  }
  const day = await findDayById(dayId, user.orgId ?? '');
  if (!day) throw new NotFoundError('Día de fichaje');

  const anomaly = day.anomalies.find((a) => a._id.equals(anomalyId));
  if (!anomaly) throw new NotFoundError('Anomalía');
  if (!anomaly.resolvedAt) {
    // Ya estaba pendiente — no-op.
    return toTimeClockDay(day);
  }

  const previousResolutionType = anomaly.resolutionType;

  const nextAnomalies = day.anomalies.map((a) =>
    a._id.equals(anomalyId)
      ? {
          ...a,
          resolvedAt: null,
          resolvedBy: null,
          resolutionType: null,
          resolutionNotes: null,
        }
      : a,
  );
  const pending = nextAnomalies.filter((a) => !a.resolvedAt).length;

  // Si veníamos de 'absence' por una resolución que ahora se quita, volver
  // a scheduled_no_clockin (no hay eventos).
  let nextStatus = day.status;
  if (
    day.status === 'absence' &&
    !day.shift.actualStart &&
    !nextAnomalies.some(
      (a) =>
        a.type === 'shift_missing_clockin' &&
        a.resolvedAt &&
        (a.resolutionType === 'absence_justified' ||
          a.resolutionType === 'absence_unjustified'),
    )
  ) {
    nextStatus = 'scheduled_no_clockin';
  } else if (day.status === 'completed' && pending > 0) {
    // Si volvió a haber pendientes, marca con issues
    nextStatus = 'completed_with_issues';
  }

  const updated = await updateDay(dayId, day.orgId.toHexString(), {
    anomalies: nextAnomalies,
    pendingItemsCount: pending,
    reviewStatus: pending > 0 ? 'pending' : 'auto_ok',
    status: nextStatus,
  });
  if (!updated) throw new NotFoundError('Día de fichaje');

  await emitAuditEvent({
    category: 'time-clocks',
    action: 'anomaly_unresolved',
    target: {
      type: 'time_clock_day',
      id: dayId,
      displayName:
        updated.humanReadableId ??
        `${updated.denormalizedRefs.userName} · ${updated.workDate.toISOString().slice(0, 10)}`,
    },
    metadata: {
      anomalyType: anomaly.type,
      previousResolutionType,
    },
    context,
  });

  return toTimeClockDay(updated);
}

