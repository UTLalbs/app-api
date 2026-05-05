import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { buildScopeFilter } from '../../../middleware/scope';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/AppError';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';
import { getLocationCollection } from '../../locations/location.model';
import type { LocationDocument } from '../../locations/location.types';
import { getOrgTimezone } from '../../organizations/organization.service';
import { getUserCollection } from '../../users/user.model';
import { findOverlappingForSchedule } from '../absences/absence.repository';
import {
  findAssignmentById,
  findAssignmentsByUserInRange,
  findTemplateById,
} from '../schedules/schedule.repository';
import type {
  ScheduleAssignmentDocument,
  ServiceCommitmentDocument,
  WorkPeriodDocument,
} from '../schedules/schedule.types';

import { computeGeofenceStatus } from './geofence.helpers';
import { tryMaterializeFromWorkSchedule } from './materialize.helpers';
import {
  combineDateAndTimeInTimezone,
  endOfUtcDay,
  parseTime,
  startOfUtcDay,
  workDateInTimezone,
} from './overtime.helpers';
import { recalculateDay } from './time-clock-day.service';
import {
  notifyEventExcluded,
  notifyGeofenceAnomaly,
  notifyManualCorrection,
} from './time-clock.notifications';
import {
  findActiveEmployees,
  findEventById,
  findEvents,
  findLastEventForUser,
  insertEvent,
  toTimeClockEvent,
  updateEvent,
} from './time-clock.repository';
import type {
  ActiveEmployeeSummary,
  ClockSource,
  CreateEventDto,
  CreateManualEventDto,
  ListEventsFilter,
  MyClockStatus,
  TimeClockEvent,
  TimeClockEventDocument,
  TimeClockEventType,
} from './time-clock.types';

// ── Helpers internos ──────────────────────────────────────────────────────

interface EmployeeMeta {
  id: string;
  displayName: string;
  position: string | null;
  managerId: string | null;
}

async function loadEmployeeOrThrow(
  orgId: string,
  userId: string,
): Promise<EmployeeMeta> {
  if (!ObjectId.isValid(userId)) throw new ValidationError('userId inválido');

  const doc = await getUserCollection().findOne(
    {
      _id: new ObjectId(userId),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    {
      projection: {
        _id: 1,
        displayName: 1,
        'employeeProfile.isEmployee': 1,
        'employeeProfile.position': 1,
        'employeeProfile.managerId': 1,
      },
    },
  );
  if (!doc) throw new NotFoundError('Empleado');
  if (!doc.employeeProfile?.isEmployee) {
    throw new ValidationError('El usuario referenciado no es empleado');
  }

  const rawManagerId = doc.employeeProfile?.managerId;
  const managerId =
    rawManagerId && ObjectId.isValid(rawManagerId as string | ObjectId)
      ? new ObjectId(rawManagerId as string | ObjectId).toHexString()
      : null;

  return {
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    position: doc.employeeProfile?.position ?? null,
    managerId,
  };
}

async function loadLocation(
  orgId: ObjectId,
  locationId: ObjectId,
): Promise<LocationDocument | null> {
  const doc = await getLocationCollection().findOne({
    _id: locationId,
    orgId,
    deletedAt: null,
  });
  return doc as LocationDocument | null;
}

// Estrategia híbrida A+B para asociar evento ↔ schedule.
async function resolveScheduleForEvent(
  orgId: string,
  userId: string,
  eventDate: Date,
  scheduleId: string | null,
  periodId: string | null,
): Promise<{
  schedule: ScheduleAssignmentDocument | null;
  period: WorkPeriodDocument | null;
}> {
  // (A) cliente envió IDs y son válidos para este usuario.
  if (scheduleId && periodId && ObjectId.isValid(scheduleId) && ObjectId.isValid(periodId)) {
    const schedule = await findAssignmentById(scheduleId, orgId);
    if (
      schedule &&
      schedule.userId.toHexString() === userId &&
      !schedule.deletedAt
    ) {
      const period =
        schedule.periods.find((p) => p._id.toHexString() === periodId) ?? null;
      if (period) return { schedule, period };
    }
  }

  // (B) inferir por proximidad temporal en los schedules del día.
  const dayStart = startOfUtcDay(eventDate);
  const dayEnd = endOfUtcDay(eventDate);
  const schedules = await findAssignmentsByUserInRange(orgId, userId, dayStart, dayEnd);
  if (schedules.length === 0) return { schedule: null, period: null };

  if (schedules.length === 1 && schedules[0].periods.length === 1) {
    return { schedule: schedules[0], period: schedules[0].periods[0] };
  }

  const eventMinutes =
    eventDate.getUTCHours() * 60 + eventDate.getUTCMinutes();
  const candidates = schedules.flatMap((s) =>
    s.periods.map((p) => ({ schedule: s, period: p })),
  );
  let best = candidates[0];
  let bestDistance = Infinity;
  for (const c of candidates) {
    const startMin = parseTime(c.period.startTime);
    const endMin = parseTime(c.period.endTime);
    const distance = Math.min(
      Math.abs(eventMinutes - startMin),
      Math.abs(eventMinutes - endMin),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = c;
    }
  }
  return { schedule: best.schedule, period: best.period };
}

// Determina la location esperada y el commitment según el tipo de evento.
function determineExpectedLocationAndCommitment(args: {
  type: TimeClockEventType;
  period: WorkPeriodDocument;
  eventDate: Date;
  serviceCommitmentId: string | null;
  schedule: ScheduleAssignmentDocument;
  orgTimezone: string;
}): {
  expectedLocationId: ObjectId | null;
  serviceCommitment: ServiceCommitmentDocument | null;
} {
  const { type, period, eventDate, serviceCommitmentId, schedule, orgTimezone } = args;

  if (type === 'shift_start') {
    return { expectedLocationId: period.startLocationId, serviceCommitment: null };
  }
  if (type === 'shift_end') {
    return { expectedLocationId: period.endLocationId, serviceCommitment: null };
  }
  if (type === 'break_start' || type === 'break_end' || type === 'meal_start' || type === 'meal_end') {
    // Por default break/comida ocurren en startLocation. En la práctica el
    // empleado puede comer fuera; no marcamos anomalía si no coincide.
    return { expectedLocationId: period.startLocationId, serviceCommitment: null };
  }
  // location_arrival / location_departure
  let commitment: ServiceCommitmentDocument | null = null;
  if (serviceCommitmentId && ObjectId.isValid(serviceCommitmentId)) {
    commitment =
      period.serviceCommitments.find(
        (c) => c._id.toHexString() === serviceCommitmentId,
      ) ?? null;
  } else {
    // Tomar el commitment más cercano temporalmente.
    let bestDistance = Infinity;
    for (const c of period.serviceCommitments) {
      const start = combineDateAndTimeInTimezone(schedule.workDate, c.startTime, orgTimezone);
      const end = combineDateAndTimeInTimezone(schedule.workDate, c.endTime, orgTimezone);
      const distance = Math.min(
        Math.abs(eventDate.getTime() - start.getTime()),
        Math.abs(eventDate.getTime() - end.getTime()),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        commitment = c;
      }
    }
  }
  return {
    expectedLocationId: commitment?.locationId ?? null,
    serviceCommitment: commitment,
  };
}

function generateEventHumanReadableId(date: Date, idHex: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `TC-${y}-${m}-${d}-${idHex.slice(-4).toUpperCase()}`;
}

function formatLocalTime(date: Date, timezone: string): string {
  // Devuelve algo tipo "2026-04-27 06:43:21 -07:00" usando Intl.
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    });
    return formatter
      .format(date)
      .replace(',', '')
      .replace(/GMT/, '');
  } catch {
    return date.toISOString();
  }
}

// ── Crear evento desde web/mobile ─────────────────────────────────────────

interface DeviceInfo {
  ip: string | null;
  userAgent: string | null;
}

export async function registerEvent(
  user: AuthenticatedUser,
  orgId: string,
  input: CreateEventDto,
  device: DeviceInfo,
  source: ClockSource,
  context: AuditContext,
): Promise<TimeClockEvent> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create event');
  }

  // 1. Validar permisos: si no es a sí mismo, requiere `correct`.
  if (user.id !== input.userId) {
    const canCorrect =
      user.resolvedPermissions.time_clocks?.includes('correct') ?? false;
    if (!canCorrect) {
      throw new ForbiddenError('Sin permisos para fichar por otro empleado');
    }
  }

  // 2. Validar empleado.
  const employee = await loadEmployeeOrThrow(orgId, input.userId);

  // 3. Resolver fecha del evento.
  const eventDate = input.clockedAt ?? new Date();

  // 4. Verificar si tiene ausencia aprobada vigente — permitimos el fichaje
  //    pero queda marcado para revisión manual del supervisor.
  const overlappingAbsences = await findOverlappingForSchedule(
    orgId,
    input.userId,
    startOfUtcDay(eventDate),
  );
  const hasApprovedAbsence = overlappingAbsences.some((a) => a.status === 'approved');
  if (hasApprovedAbsence) {
    logger.warn(
      { userId: input.userId, eventDate },
      'Fichaje recibido para empleado con ausencia aprobada vigente',
    );
  }

  // 5. Auto-materializar Assignment desde workSchedule si no existe (paso A0).
  //    Esto permite que el calendario muestre la jornada virtual y que el
  //    fichaje quede asociado a un Assignment real sin intervención manual.
  await tryMaterializeFromWorkSchedule(
    orgId,
    input.userId,
    eventDate,
    employee,
    { id: context.actor.id, displayName: context.actor.displayName },
  );

  // 6. Resolver schedule y period (estrategia A+B).
  const { schedule, period } = await resolveScheduleForEvent(
    orgId,
    input.userId,
    eventDate,
    input.scheduleId,
    input.periodId,
  );

  // 6. Determinar location esperada.
  let expectedLocationId: ObjectId | null = null;
  let serviceCommitment: ServiceCommitmentDocument | null = null;
  if (period && schedule) {
    const result = determineExpectedLocationAndCommitment({
      type: input.type,
      period,
      eventDate,
      serviceCommitmentId: input.serviceCommitmentId,
      schedule,
      orgTimezone: user.orgTimezone,
    });
    expectedLocationId = result.expectedLocationId;
    serviceCommitment = result.serviceCommitment;
  }

  // 7. Geofence.
  let geofenceStatus: 'inside' | 'outside' | 'no_reference' = 'no_reference';
  let distanceFromExpectedMeters: number | null = null;
  let expectedLocationName: string | null = null;

  if (expectedLocationId) {
    const location = await loadLocation(new ObjectId(orgId), expectedLocationId);
    expectedLocationName = location?.name ?? null;
    const geofenceResult = computeGeofenceStatus({
      expectedGeofence: location?.geofence ?? null,
      reportedLocation: input.reportedLocation,
    });
    geofenceStatus = geofenceResult.geofenceStatus;
    distanceFromExpectedMeters = geofenceResult.distanceFromExpectedMeters;
  }

  // 8. Construir documento.
  const newId = new ObjectId();
  const now = new Date();
  const doc: TimeClockEventDocument = {
    _id: newId,
    orgId: new ObjectId(orgId),
    userId: new ObjectId(input.userId),
    type: input.type,
    clockedAt: eventDate,
    clockedAtLocal: formatLocalTime(eventDate, user.orgTimezone),
    scheduleId: schedule?._id ?? null,
    periodId: period?._id ?? null,
    serviceCommitmentId: serviceCommitment?._id ?? null,
    reportedLocation: input.reportedLocation,
    expectedLocationId,
    geofenceStatus,
    distanceFromExpectedMeters,
    source,
    correctedBy: null,
    correctionReason: null,
    correctsEventId: null,
    isExcluded: false,
    excludedBy: null,
    excludedAt: null,
    exclusionReason: null,
    device: {
      ip: device.ip,
      userAgent: device.userAgent,
      deviceId: null,
    },
    reviewStatus: geofenceStatus === 'inside' ? 'auto_ok' : 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    reviewSessionId: null,
    notes: input.notes,
    llmSummary: null,
    humanReadableId: generateEventHumanReadableId(eventDate, newId.toHexString()),
    denormalizedRefs: {
      userName: employee.displayName,
      userPosition: employee.position,
      expectedLocationName,
      expectedLocationColor: null,
    },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await insertEvent(doc);

  // 9. Recalcular el día agregado. Usar workDate del día LOCAL del org —
  //    un evento a las 00:05 UTC en Mexico (UTC-5) pertenece al día anterior
  //    Mexico, no al UTC equivalente.
  const orgTzForRecalc = await getOrgTimezone(orgId);
  const recalcWorkDate = workDateInTimezone(eventDate, orgTzForRecalc);
  await recalculateDay(
    new ObjectId(orgId),
    new ObjectId(input.userId),
    recalcWorkDate,
  ).catch((err) =>
    logger.warn(
      { err, userId: input.userId, eventDate },
      'Failed to recalculate day after event',
    ),
  );

  // 10. Notificación si fuera de geocerca.
  if (geofenceStatus !== 'inside' && expectedLocationId) {
    await notifyGeofenceAnomaly(doc, employee, {
      id: context.actor.id,
      displayName: context.actor.displayName,
    });
  }

  // 11. Audit.
  await emitAuditEvent({
    category: 'time-clocks',
    action: 'event_created',
    target: {
      type: 'time_clock_event',
      id: doc._id.toHexString(),
      displayName: doc.humanReadableId ?? employee.displayName,
    },
    metadata: {
      type: input.type,
      source,
      geofenceStatus,
      hasApprovedAbsence,
    },
    context,
  });

  return toTimeClockEvent(doc);
}

// ── Crear evento manual (corrección por supervisor) ───────────────────────

export async function registerManualEvent(
  user: AuthenticatedUser,
  orgId: string,
  input: CreateManualEventDto,
  device: DeviceInfo,
  context: AuditContext,
): Promise<TimeClockEvent> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create manual event');
  }

  // Permiso obligatorio para correcciones.
  const canCorrect =
    user.resolvedPermissions.time_clocks?.includes('correct') ?? false;
  if (!canCorrect) {
    throw new ForbiddenError('Sin permisos para registrar fichajes manuales');
  }

  const employee = await loadEmployeeOrThrow(orgId, input.userId);

  // Reusa registerEvent para todo el pipeline + sobreescribe campos manuales.
  const result = await registerEvent(
    user,
    orgId,
    {
      userId: input.userId,
      type: input.type,
      clockedAt: input.clockedAt,
      scheduleId: null,
      periodId: null,
      serviceCommitmentId: null,
      reportedLocation: null,
      notes: input.notes,
    },
    device,
    'manual_correction',
    context,
  );

  // Marcar el evento como corregido por este usuario.
  const updated = await updateEvent(result.id, orgId, {
    correctedBy: new ObjectId(user.id),
    correctionReason: input.correctionReason,
    correctsEventId:
      input.correctsEventId && ObjectId.isValid(input.correctsEventId)
        ? new ObjectId(input.correctsEventId)
        : null,
    expectedLocationId: new ObjectId(input.expectedLocationId),
    // Manual events no validan geofence — el supervisor da fe.
    reviewStatus: 'resolved_ok',
    reviewedBy: new ObjectId(user.id),
    reviewedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Evento');

  await notifyManualCorrection(updated, {
    id: context.actor.id,
    displayName: context.actor.displayName,
  });

  await emitAuditEvent({
    category: 'time-clocks',
    action: 'event_manual_created',
    target: {
      type: 'time_clock_event',
      id: updated._id.toHexString(),
      displayName: updated.humanReadableId ?? employee.displayName,
    },
    metadata: {
      type: input.type,
      correctionReason: input.correctionReason,
      correctsEventId: input.correctsEventId,
    },
    context,
  });

  return toTimeClockEvent(updated);
}

// ── Registro batch (varios eventos en una captura) ────────────────────────
//
// Uso típico: planner captura un fichaje atrasado completo (entrada, comida,
// salida, descansos) en un solo submit. Procesamos secuencialmente — si uno
// falla, devolvemos error y los anteriores quedan persistidos. El frontend
// debe mostrar el progreso y permitir retry. No usamos transacciones MongoDB
// para mantener simple el flujo.

export interface ManualEventBatchInput {
  userId: string;
  correctionReason: string;
  events: ReadonlyArray<{
    type: import('./time-clock.types').TimeClockEventType;
    clockedAt: Date;
    expectedLocationId: string;
    notes: string | null;
  }>;
}

export async function registerManualEventsBatch(
  user: AuthenticatedUser,
  orgId: string,
  input: ManualEventBatchInput,
  device: DeviceInfo,
  context: AuditContext,
): Promise<TimeClockEvent[]> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create manual events');
  }
  const canCorrect =
    user.resolvedPermissions.time_clocks?.includes('correct') ?? false;
  if (!canCorrect) {
    throw new ForbiddenError('Sin permisos para registrar fichajes manuales');
  }

  const created: TimeClockEvent[] = [];
  // Procesa en orden cronológico para que recalculateDay coherente al final.
  const sorted = [...input.events].sort(
    (a, b) => a.clockedAt.getTime() - b.clockedAt.getTime(),
  );
  for (const ev of sorted) {
    const result = await registerManualEvent(
      user,
      orgId,
      {
        userId: input.userId,
        type: ev.type,
        clockedAt: ev.clockedAt,
        expectedLocationId: ev.expectedLocationId,
        correctionReason: input.correctionReason,
        correctsEventId: null,
        notes: ev.notes,
      },
      device,
      context,
    );
    created.push(result);
  }
  return created;
}

// ── Excluir evento ────────────────────────────────────────────────────────

export async function excludeEvent(
  user: AuthenticatedUser,
  id: string,
  orgId: string,
  exclusionReason: string,
  context: AuditContext,
): Promise<TimeClockEvent> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to exclude event');
  }
  const canExclude =
    user.resolvedPermissions.time_clocks?.includes('exclude') ?? false;
  if (!canExclude) {
    throw new ForbiddenError('Sin permisos para excluir fichajes');
  }

  const existing = await findEventById(id, orgId);
  if (!existing) throw new NotFoundError('Evento de fichaje');
  if (existing.isExcluded) {
    throw new ConflictError('Este fichaje ya está excluido');
  }

  const updated = await updateEvent(id, orgId, {
    isExcluded: true,
    excludedBy: new ObjectId(user.id),
    excludedAt: new Date(),
    exclusionReason,
    reviewStatus: 'resolved_action',
    reviewedBy: new ObjectId(user.id),
    reviewedAt: new Date(),
  });
  if (!updated) throw new NotFoundError('Evento de fichaje');

  // Recalcular el día — la exclusión cambia el cómputo.
  const orgTzExclude = await getOrgTimezone(updated.orgId.toHexString());
  const excludeWorkDate = workDateInTimezone(updated.clockedAt, orgTzExclude);
  await recalculateDay(updated.orgId, updated.userId, excludeWorkDate).catch(
    (err) =>
      logger.warn(
        { err, eventId: id },
        'Failed to recalculate day after exclude event',
      ),
  );

  // Notificar al empleado y manager.
  const employee = await loadEmployeeOrThrow(orgId, updated.userId.toHexString());
  await notifyEventExcluded(updated, employee, {
    id: context.actor.id,
    displayName: context.actor.displayName,
  });

  await emitAuditEvent({
    category: 'time-clocks',
    action: 'event_excluded',
    target: {
      type: 'time_clock_event',
      id,
      displayName: updated.humanReadableId ?? existing.denormalizedRefs.userName,
    },
    metadata: { exclusionReason },
    context,
  });

  return toTimeClockEvent(updated);
}

// ── Listados ──────────────────────────────────────────────────────────────

export async function listEvents(
  user: AuthenticatedUser,
  orgId: string,
  filter: ListEventsFilter,
): Promise<{ items: TimeClockEvent[]; total: number }> {
  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const result = await findEvents(orgId, filter, scopeFilter);
  return {
    items: result.items.map(toTimeClockEvent),
    total: result.total,
  };
}

export async function getEvent(
  id: string,
  orgId: string,
): Promise<TimeClockEvent> {
  const doc = await findEventById(id, orgId);
  if (!doc) throw new NotFoundError('Evento de fichaje');
  return toTimeClockEvent(doc);
}

// ── "Mi fichaje" — estado actual del usuario ──────────────────────────────

export async function getMyClockStatus(
  user: AuthenticatedUser,
  orgId: string,
): Promise<MyClockStatus> {
  const userId = new ObjectId(user.id);

  // 1. Schedule del día. NO materializamos pre-emptivamente — si no existe
  //    Assignment real (porque aún no hay fichaje), computamos un schedule
  //    virtual desde el workSchedule del empleado para mostrar el horario
  //    esperado. La materialización ocurre solo al fichar.
  const today = new Date();
  const dayStart = startOfUtcDay(today);
  const dayEnd = endOfUtcDay(today);
  const schedules = await findAssignmentsByUserInRange(
    orgId,
    user.id,
    dayStart,
    dayEnd,
  );
  let schedule = schedules[0] ?? null;
  let period = schedule?.periods[0] ?? null;

  // Si no hay Assignment real, construir uno virtual desde workSchedule.
  // Vive solo en memoria — no se persiste hasta que llegue un fichaje.
  let virtualScheduleData: VirtualScheduleData | null = null;
  if (!schedule) {
    virtualScheduleData = await buildVirtualScheduleForToday(
      orgId,
      user.id,
      today,
    );
  }

  // 2. Ausencia activa.
  const overlappingAbsences = await findOverlappingForSchedule(
    orgId,
    user.id,
    today,
  );
  const activeAbsence = overlappingAbsences.find((a) => a.status === 'approved') ?? null;

  // 3. Último evento del usuario.
  const lastEventDoc = await findLastEventForUser(orgId, user.id);

  // 4. Day agregado de hoy (puede no existir aún).
  const { findDayByUserAndDate } = await import('./time-clock-day.repository');
  const dayDoc = await findDayByUserAndDate(orgId, user.id, dayStart);

  // 5. Determinar currentState.
  // Si hay schedule real OR virtual, el empleado tiene jornada esperada hoy.
  const hasScheduleToday = !!schedule || !!virtualScheduleData;
  let currentState: MyClockStatus['currentState'] = 'no_schedule';
  if (activeAbsence) {
    currentState = 'absence';
  } else if (!hasScheduleToday) {
    currentState = 'no_schedule';
  } else if (!lastEventDoc) {
    currentState = 'before_shift';
  } else {
    switch (lastEventDoc.type) {
      case 'shift_start':
      case 'location_departure':
        currentState = 'clocked_in';
        break;
      case 'location_arrival':
        currentState = 'at_service';
        break;
      case 'break_start':
      case 'meal_start':
        currentState = 'on_break';
        break;
      case 'break_end':
      case 'meal_end':
        currentState = 'clocked_in';
        break;
      case 'shift_end':
        currentState = 'completed';
        break;
    }
  }

  // 6. Resolver nombres de locations del period (si existe).
  let expectedStartLocationName: string | null = null;
  let expectedEndLocationName: string | null = null;
  if (period) {
    const ids = new Set([
      period.startLocationId.toHexString(),
      period.endLocationId.toHexString(),
    ]);
    const docs = await getLocationCollection()
      .find(
        {
          _id: { $in: [...ids].map((id) => new ObjectId(id)) },
          orgId: new ObjectId(orgId),
        },
        { projection: { _id: 1, name: 1 } },
      )
      .toArray();
    const map = new Map(docs.map((d) => [d._id.toHexString(), d.name]));
    expectedStartLocationName = map.get(period.startLocationId.toHexString()) ?? null;
    expectedEndLocationName = map.get(period.endLocationId.toHexString()) ?? null;
  }

  void userId;

  // 7. Lazy-import del helper para evitar import circular.
  const { toTimeClockDay } = await import('./time-clock-day.repository');

  // Resolver locations del schedule virtual si aplica.
  if (!period && virtualScheduleData) {
    if (virtualScheduleData.startLocationId) {
      const ids = new Set([virtualScheduleData.startLocationId]);
      if (virtualScheduleData.endLocationId) {
        ids.add(virtualScheduleData.endLocationId);
      }
      const docs = await getLocationCollection()
        .find(
          {
            _id: { $in: [...ids].map((id) => new ObjectId(id)) },
            orgId: new ObjectId(orgId),
          },
          { projection: { _id: 1, name: 1 } },
        )
        .toArray();
      const map = new Map(docs.map((d) => [d._id.toHexString(), d.name]));
      expectedStartLocationName = map.get(virtualScheduleData.startLocationId) ?? null;
      expectedEndLocationName = virtualScheduleData.endLocationId
        ? map.get(virtualScheduleData.endLocationId) ?? null
        : null;
    }
  }

  return {
    currentState,
    schedule: schedule
      ? {
          id: schedule._id.toHexString(),
          workDate: schedule.workDate.toISOString().slice(0, 10),
          expectedStart: period?.startTime ?? null,
          expectedEnd: period?.endTime ?? null,
          expectedStartLocationId: period?.startLocationId.toHexString() ?? null,
          expectedStartLocationName,
          expectedEndLocationId: period?.endLocationId.toHexString() ?? null,
          expectedEndLocationName,
        }
      : virtualScheduleData
        ? {
            id: `virtual-${user.id}-${dayStart.toISOString().slice(0, 10)}`,
            workDate: dayStart.toISOString().slice(0, 10),
            expectedStart: virtualScheduleData.startTime,
            expectedEnd: virtualScheduleData.endTime,
            expectedStartLocationId: virtualScheduleData.startLocationId,
            expectedStartLocationName,
            expectedEndLocationId: virtualScheduleData.endLocationId,
            expectedEndLocationName,
          }
        : null,
    lastEvent: lastEventDoc ? toTimeClockEvent(lastEventDoc) : null,
    todayDay: dayDoc ? toTimeClockDay(dayDoc) : null,
    activeAbsenceCategoryName:
      activeAbsence?.denormalizedRefs.categoryName ?? null,
  };
}

// ── Schedule virtual desde workSchedule (sin persistir) ────────────────────
//
// Resuelve el patrón del empleado para hoy (custom o template) y devuelve
// los datos suficientes para que getMyClockStatus muestre el horario esperado
// sin crear `ScheduleAssignment` en BD. La materialización se difiere hasta
// que llegue un fichaje.

interface VirtualScheduleData {
  startTime: string;
  endTime: string;
  startLocationId: string | null;
  endLocationId: string | null;
}

async function buildVirtualScheduleForToday(
  orgId: string,
  userId: string,
  date: Date,
): Promise<VirtualScheduleData | null> {
  const { getOrgTimezone } = await import('../../organizations/organization.service');
  const orgTimezone = await getOrgTimezone(orgId);
  const workDate = workDateInTimezone(date, orgTimezone);

  const userDoc = await (
    await import('../../users/user.model')
  ).getUserCollection().findOne(
    {
      _id: new ObjectId(userId),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { projection: { 'employeeProfile.workSchedule': 1 } },
  );

  const ws = userDoc?.employeeProfile?.workSchedule as
    | {
        mode?: string;
        templateId?: ObjectId | string | null;
        customPattern?: Record<string, {
          startTime: string;
          endTime: string;
          startLocationId?: ObjectId | string | null;
          endLocationId?: ObjectId | string | null;
        } | null> | null;
        restDays?: string[];
      }
    | null
    | undefined;
  if (!ws || ws.mode !== 'fixed') return null;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[workDate.getUTCDay()];
  if (ws.restDays?.includes(dayName)) return null;

  const idToHex = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof ObjectId) return v.toHexString();
    if (typeof v === 'string') return v;
    return null;
  };

  // Resolver shift desde customPattern primero, luego template
  const shiftRaw = ws.customPattern?.[dayName];
  if (shiftRaw) {
    return {
      startTime: shiftRaw.startTime,
      endTime: shiftRaw.endTime,
      startLocationId: idToHex(shiftRaw.startLocationId),
      endLocationId: idToHex(shiftRaw.endLocationId),
    };
  }

  if (ws.templateId) {
    const tplId = ws.templateId instanceof ObjectId
      ? ws.templateId.toHexString()
      : String(ws.templateId);
    const tpl = await findTemplateById(tplId, orgId);
    if (tpl) {
      return {
        startTime: tpl.defaultStartTime,
        endTime: tpl.defaultEndTime,
        startLocationId: tpl.defaultStartLocationId ?? null,
        endLocationId: tpl.defaultEndLocationId ?? tpl.defaultStartLocationId ?? null,
      };
    }
  }

  return null;
}

// Versión compacta para el widget de la topbar (datos mínimos, latencia baja).
export async function getMyWidgetStatus(
  user: AuthenticatedUser,
  orgId: string,
): Promise<{
  currentState: MyClockStatus['currentState'];
  lastEventAt: Date | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
}> {
  const full = await getMyClockStatus(user, orgId);
  return {
    currentState: full.currentState,
    lastEventAt: full.lastEvent?.clockedAt ?? null,
    scheduleStartTime: full.schedule?.expectedStart ?? null,
    scheduleEndTime: full.schedule?.expectedEnd ?? null,
  };
}

// ── Empleados activos ──────────────────────────────────────────────────────

export async function listActiveEmployees(
  user: AuthenticatedUser,
  orgId: string,
): Promise<ActiveEmployeeSummary[]> {
  const scopeFilter = await buildScopeFilter(user, user.permissionScope, 'time_clocks');
  const events = await findActiveEmployees(orgId, scopeFilter);
  return events.map((e) => ({
    userId: e.userId.toHexString(),
    userName: e.denormalizedRefs.userName,
    userPosition: e.denormalizedRefs.userPosition,
    shiftStartedAt: e.clockedAt,
    expectedLocationId: e.expectedLocationId
      ? e.expectedLocationId.toHexString()
      : null,
    expectedLocationName: e.denormalizedRefs.expectedLocationName,
    currentState: 'clocked_in',
  }));
}
