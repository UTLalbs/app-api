import { ValidationError } from '../../../shared/errors/AppError';

import type {
  ScheduleAssignmentDocument,
  ServiceCommitmentDto,
  WorkPeriodDocument,
  WorkPeriodDto,
} from './schedule.types';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 1440;

export function parseTime(hhmm: string): number {
  if (!HHMM_REGEX.test(hhmm)) {
    throw new ValidationError(`Hora inválida: '${hhmm}' (esperado HH:MM)`);
  }
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Normaliza una fecha a 00:00 UTC del día (para que workDate sea estable
// y se pueda comparar/indexar sin desviaciones por timezone del cliente).
export function normalizeWorkDate(date: Date): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ── Cálculo de minutos por periodo y assignment ────────────────────────────

export function calcPeriodMinutes(
  period: WorkPeriodDocument | WorkPeriodDto,
): number {
  const start = parseTime(period.startTime);
  const end = parseTime(period.endTime);

  let raw = period.multiDay
    ? period.endDayOffset * MINUTES_PER_DAY + end - start
    : end - start;

  if (raw < 0) raw = 0;

  if (period.applyAutoBreak && raw > 6 * 60) {
    raw -= period.breakDurationMinutes;
  }

  return Math.max(raw, 0);
}

export function calcServiceMinutes(
  period: WorkPeriodDocument | WorkPeriodDto,
): number {
  return period.serviceCommitments.reduce((sum, sc) => {
    const start = parseTime(sc.startTime);
    const end = parseTime(sc.endTime);
    return sum + Math.max(end - start, 0);
  }, 0);
}

export function calcAssignmentMinutes(
  assignment: Pick<ScheduleAssignmentDocument, 'periods'>,
): number {
  return assignment.periods.reduce(
    (sum, p) => sum + calcPeriodMinutes(p),
    0,
  );
}

// ── Cálculo de horas extra LFT ─────────────────────────────────────────────
// Regla LFT (Art. 66-68): jornada semanal regular hasta 48h. Las primeras
// 9h extra se pagan al doble (100% adicional). Después del límite, al triple
// (200% adicional). Para un planner de turnos solo importa cuántas horas
// proyectadas caen en cada cubeta, no el monto monetario.

export interface OvertimeResult {
  regular: number; // minutos
  ot100: number;   // primeras 9h extra (100% adicional)
  ot200: number;   // resto (200% adicional)
}

const REGULAR_LIMIT = 48 * 60;
const OT100_LIMIT = REGULAR_LIMIT + 9 * 60;

export function calcOvertimeForWeek(totalMinutes: number): OvertimeResult {
  if (totalMinutes <= REGULAR_LIMIT) {
    return { regular: totalMinutes, ot100: 0, ot200: 0 };
  }
  if (totalMinutes <= OT100_LIMIT) {
    return {
      regular: REGULAR_LIMIT,
      ot100: totalMinutes - REGULAR_LIMIT,
      ot200: 0,
    };
  }
  return {
    regular: REGULAR_LIMIT,
    ot100: 9 * 60,
    ot200: totalMinutes - OT100_LIMIT,
  };
}

// ── Validaciones de coherencia interna ─────────────────────────────────────

export function validatePeriodTimes(period: WorkPeriodDto): void {
  parseTime(period.startTime);
  parseTime(period.endTime);

  if (period.multiDay) {
    if (period.endDayOffset < 1) {
      throw new ValidationError([
        {
          field: 'periods.endDayOffset',
          message: 'Multi-día requiere endDayOffset >= 1',
        },
      ]);
    }
  } else {
    if (parseTime(period.startTime) >= parseTime(period.endTime)) {
      throw new ValidationError([
        {
          field: 'periods.endTime',
          message: 'endTime debe ser posterior a startTime',
        },
      ]);
    }
    if (period.endDayOffset !== 0) {
      throw new ValidationError([
        {
          field: 'periods.endDayOffset',
          message: 'endDayOffset debe ser 0 si no es multi-día',
        },
      ]);
    }
  }
}

export function validateCommitmentsInsidePeriod(period: WorkPeriodDto): void {
  if (period.shiftType === 'training') {
    if (period.serviceCommitments.length > 0) {
      throw new ValidationError([
        {
          field: 'periods.serviceCommitments',
          message: 'Capacitación no admite compromisos de servicio',
        },
      ]);
    }
    return;
  }

  const periodStart = parseTime(period.startTime);
  const periodEnd = period.multiDay
    ? parseTime(period.endTime) + period.endDayOffset * MINUTES_PER_DAY
    : parseTime(period.endTime);

  for (const sc of period.serviceCommitments) {
    const scStart = parseTime(sc.startTime);
    const scEnd = parseTime(sc.endTime);

    if (scStart >= scEnd) {
      throw new ValidationError([
        {
          field: 'periods.serviceCommitments',
          message: `Compromiso ${sc.startTime}-${sc.endTime}: startTime debe ser anterior a endTime`,
        },
      ]);
    }

    if (scStart < periodStart || scEnd > periodEnd) {
      throw new ValidationError([
        {
          field: 'periods.serviceCommitments',
          message: `Compromiso ${sc.startTime}-${sc.endTime} fuera del periodo ${period.startTime}-${period.endTime}`,
        },
      ]);
    }
  }

  // Detectar solapamientos entre commitments del mismo period.
  const sorted = [...period.serviceCommitments].sort(
    (a, b) => parseTime(a.startTime) - parseTime(b.startTime),
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    if (parseTime(sorted[i].endTime) > parseTime(sorted[i + 1].startTime)) {
      throw new ValidationError([
        {
          field: 'periods.serviceCommitments',
          message: `Compromisos solapados: ${sorted[i].startTime}-${sorted[i].endTime} con ${sorted[i + 1].startTime}-${sorted[i + 1].endTime}`,
        },
      ]);
    }
  }
}

// ── Helper para calcular instante absoluto de inicio/fin del periodo ───────
// Retorna minutos desde 00:00 UTC del workDate.

export function periodAbsoluteStart(
  workDate: Date,
  period: Pick<WorkPeriodDocument, 'startTime'>,
): number {
  const baseMinutes = normalizeWorkDate(workDate).getTime() / 60000;
  return baseMinutes + parseTime(period.startTime);
}

export function periodAbsoluteEnd(
  workDate: Date,
  period: Pick<
    WorkPeriodDocument,
    'startTime' | 'endTime' | 'multiDay' | 'endDayOffset'
  >,
): number {
  const baseMinutes = normalizeWorkDate(workDate).getTime() / 60000;
  const offset = period.multiDay ? period.endDayOffset * MINUTES_PER_DAY : 0;
  return baseMinutes + offset + parseTime(period.endTime);
}

// ── Compatibilidad: mismo shape entre Dto y Document para commitments ─────
// Útil para validaciones cuando viene de service.

export function isServiceCommitmentArray(
  value: unknown,
): value is ServiceCommitmentDto[] {
  return Array.isArray(value);
}
