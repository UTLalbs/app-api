import { ObjectId } from 'mongodb';

import type {
  ScheduleAssignmentDocument,
  WorkPeriodDocument,
} from '../schedules/schedule.types';

import {
  TOLERANCE_LATE_MINUTES,
  combineDateAndTimeInTimezone,
  formatMinutesAsHours,
} from './overtime.helpers';
import type {
  ServiceVisitSummaryDocument,
  ShiftSummary,
  TimeClockAnomalyDocument,
  TimeClockEventDocument,
} from './time-clock.types';

export interface DetectAnomaliesArgs {
  events: ReadonlyArray<TimeClockEventDocument>;
  schedule: ScheduleAssignmentDocument | null;
  period: WorkPeriodDocument | null;
  shift: ShiftSummary;
  serviceVisits: ReadonlyArray<ServiceVisitSummaryDocument>;
  // Timezone de la org — necesaria para reconstruir horas esperadas de los
  // commitments (que vienen como wall clock "HH:MM" en la zona local).
  orgTimezone: string;
  // Cuándo "ahora" — inyectable para tests, default Date.now().
  now?: Date;
}

// Detecta anomalías. **Función pura**: no toca DB, no emite notificaciones.
// El service decide qué hacer con el resultado.
export function detectAnomalies(
  args: DetectAnomaliesArgs,
): TimeClockAnomalyDocument[] {
  const { events, schedule, period, shift, serviceVisits, orgTimezone } = args;
  const now = args.now ?? new Date();
  const anomalies: TimeClockAnomalyDocument[] = [];

  if (!schedule || !period) return anomalies;

  // 1) Falta fichaje de inicio (la hora esperada ya pasó hace >0 min).
  if (!shift.actualStart && shift.expectedStart && now > shift.expectedStart) {
    const minutesLate = Math.round(
      (now.getTime() - shift.expectedStart.getTime()) / 60_000,
    );
    anomalies.push({
      _id: new ObjectId(),
      type: 'shift_missing_clockin',
      severity: minutesLate > 60 ? 'critical' : 'warning',
      description: `Sin fichaje de entrada · ${formatMinutesAsHours(minutesLate)} de retraso`,
      affectsRole: ['rrhh'],
      affectedEventId: null,
      affectedLocationId: period.startLocationId,
      detectedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionType: null,
      resolutionNotes: null,
    });
  }

  // 2) Retardo (hay actualStart pero excede tolerancia).
  if (
    shift.actualStart &&
    shift.expectedStart &&
    shift.lateMinutes > TOLERANCE_LATE_MINUTES
  ) {
    const startEvent = events.find((e) => e.type === 'shift_start' && !e.isExcluded);
    anomalies.push({
      _id: new ObjectId(),
      type: 'shift_late_arrival',
      severity: shift.lateMinutes > 30 ? 'critical' : 'warning',
      description: `Retardo de ${formatMinutesAsHours(shift.lateMinutes)}`,
      affectsRole: ['rrhh'],
      affectedEventId: startEvent ? startEvent._id : null,
      affectedLocationId: period.startLocationId,
      detectedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionType: null,
      resolutionNotes: null,
    });
  }

  // 3) Salida temprana.
  if (shift.isEarlyLeave && shift.actualEnd && shift.expectedEnd) {
    const endEvent = events.find((e) => e.type === 'shift_end' && !e.isExcluded);
    anomalies.push({
      _id: new ObjectId(),
      type: 'shift_early_departure',
      severity: 'warning',
      description: `Salida temprana de ${formatMinutesAsHours(shift.earlyLeaveMinutes)}`,
      affectsRole: ['rrhh'],
      affectedEventId: endEvent ? endEvent._id : null,
      affectedLocationId: period.endLocationId,
      detectedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionType: null,
      resolutionNotes: null,
    });
  }

  // 4) Falta fichaje de salida (jornada que ya debió cerrar).
  if (
    !shift.actualEnd &&
    shift.actualStart &&
    shift.expectedEnd &&
    now > shift.expectedEnd
  ) {
    const minutesPast = Math.round(
      (now.getTime() - shift.expectedEnd.getTime()) / 60_000,
    );
    anomalies.push({
      _id: new ObjectId(),
      type: 'shift_missing_clockout',
      severity: minutesPast > 120 ? 'critical' : 'warning',
      description: `Sin fichaje de salida · ${formatMinutesAsHours(minutesPast)} después de lo esperado`,
      affectsRole: ['rrhh'],
      affectedEventId: null,
      affectedLocationId: period.endLocationId,
      detectedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionType: null,
      resolutionNotes: null,
    });
  }

  // 5) Compromisos de servicio (visitas a clientes).
  for (const commitment of period.serviceCommitments) {
    const visit = serviceVisits.find((v) =>
      v.commitmentId ? v.commitmentId.equals(commitment._id) : false,
    );
    const expectedArrival = combineDateAndTimeInTimezone(
      schedule.workDate,
      commitment.startTime,
      orgTimezone,
    );

    // 5a) No llegó al cliente comprometido.
    if (commitment.isMandatory && !visit?.actualArrival && now > expectedArrival) {
      anomalies.push({
        _id: new ObjectId(),
        type: 'service_missing',
        severity: 'critical',
        description: `No llegó al servicio comprometido a las ${commitment.startTime}`,
        affectsRole: ['operations', 'client'],
        affectedEventId: null,
        affectedLocationId: commitment.locationId,
        detectedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        resolutionType: null,
        resolutionNotes: null,
      });
      continue;
    }

    // 5b) Llegada tardía (excede tolerancia del commitment).
    if (visit?.actualArrival && visit.delayMinutes > commitment.arrivalTolerance) {
      anomalies.push({
        _id: new ObjectId(),
        type: 'service_late_arrival',
        severity: visit.delayMinutes > 30 ? 'critical' : 'warning',
        description: `Llegada tardía a ${visit.locationName}: ${formatMinutesAsHours(visit.delayMinutes)}`,
        affectsRole: ['operations', 'client'],
        affectedEventId: null,
        affectedLocationId: commitment.locationId,
        detectedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        resolutionType: null,
        resolutionNotes: null,
      });
    }
  }

  // 6) Fichajes fuera de geocerca (cada uno aporta una anomalía).
  for (const event of events) {
    if (event.isExcluded) continue;
    if (event.geofenceStatus === 'outside') {
      const distance = event.distanceFromExpectedMeters ?? 0;
      anomalies.push({
        _id: new ObjectId(),
        type: 'out_of_geofence',
        severity: 'warning',
        description: `Fichaje a ${distance}m de la ubicación esperada`,
        affectsRole: ['rrhh'],
        affectedEventId: event._id,
        affectedLocationId: event.expectedLocationId,
        detectedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        resolutionType: null,
        resolutionNotes: null,
      });
    }
  }

  // 7) Tiempo extra no planeado (basado en el cómputo diario).
  if (shift.overtime100Minutes > 0 || shift.overtime200Minutes > 0) {
    const totalOt = shift.overtime100Minutes + shift.overtime200Minutes;
    anomalies.push({
      _id: new ObjectId(),
      type: 'overtime_unplanned',
      severity: 'info',
      description: `Tiempo extra no planeado: ${formatMinutesAsHours(totalOt)}`,
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

  // 8) Eventos creados manualmente (un evento corregido en nombre del empleado).
  const manualEvents = events.filter(
    (e) => !e.isExcluded && e.source === 'manual_correction',
  );
  if (manualEvents.length > 0) {
    anomalies.push({
      _id: new ObjectId(),
      type: 'manual_correction_applied',
      severity: 'info',
      description: `${manualEvents.length} fichaje(s) registrados manualmente`,
      affectsRole: ['rrhh'],
      affectedEventId: manualEvents[0]._id,
      affectedLocationId: null,
      detectedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionType: null,
      resolutionNotes: null,
    });
  }

  return anomalies;
}
