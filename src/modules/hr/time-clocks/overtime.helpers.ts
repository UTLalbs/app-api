import type {
  ShiftPeriod,
  ShiftSummary,
  TimeClockEventDocument,
  TimeClockEventType,
} from './time-clock.types';

// LFT 2023 — límites canónicos:
//   8h diarias / 48h semanales = jornada regular
//   primeras 9h extra / semana al 100%
//   resto al 200%
export const REGULAR_DAILY_LIMIT_MIN = 8 * 60;
export const REGULAR_WEEKLY_LIMIT_MIN = 48 * 60;
export const OT100_WEEKLY_LIMIT_MIN = 9 * 60;

// Si la jornada total supera 6h y los breaks/comidas explícitos suman <30m,
// se descuentan automáticamente 30m. Refleja que la ley pide media hora de
// reposo por jornada >6h y evita que un empleado que olvida fichar break
// reciba minutos extra que no trabajó.
export const AUTO_BREAK_THRESHOLD_MIN = 6 * 60;
export const AUTO_BREAK_AMOUNT_MIN = 30;

// Margen de "retardo aceptable" antes de marcar shift_late_arrival.
export const TOLERANCE_LATE_MINUTES = 5;

// ── Pares de eventos ──────────────────────────────────────────────────────

interface PairResult {
  totalMinutes: number;
  pairs: Array<{ start: Date; end: Date; minutes: number }>;
}

// Empareja eventos `startType` con `endType` (en orden cronológico) y suma
// los minutos. Si hay un start sin end (jornada en curso), se ignora.
export function calcPairsDuration(
  events: ReadonlyArray<TimeClockEventDocument>,
  startType: TimeClockEventType,
  endType: TimeClockEventType,
  // Si hay un par "abierto" (start sin end) y se pasa fallbackEnd, se cierra
  // con esa fecha. Útil para calcular duraciones de jornadas en progreso.
  fallbackEnd: Date | null = null,
): PairResult {
  const sorted = [...events]
    .filter((e) => !e.isExcluded)
    .sort((a, b) => a.clockedAt.getTime() - b.clockedAt.getTime());

  const pairs: PairResult['pairs'] = [];
  let openStart: Date | null = null;

  for (const e of sorted) {
    if (e.type === startType) {
      // Si llegan dos starts seguidos, el último gana (el primero se descarta).
      openStart = e.clockedAt;
    } else if (e.type === endType && openStart) {
      const minutes = Math.max(0, (e.clockedAt.getTime() - openStart.getTime()) / 60_000);
      pairs.push({ start: openStart, end: e.clockedAt, minutes });
      openStart = null;
    }
  }

  // Cierre virtual del último par abierto si hay fallback (jornada activa).
  if (openStart && fallbackEnd && fallbackEnd > openStart) {
    const minutes = Math.max(0, (fallbackEnd.getTime() - openStart.getTime()) / 60_000);
    pairs.push({ start: openStart, end: fallbackEnd, minutes });
  }

  const totalMinutes = pairs.reduce((sum, p) => sum + p.minutes, 0);
  return { totalMinutes, pairs };
}

// ── Cálculos de jornada ───────────────────────────────────────────────────

export interface ShiftMinutesBreakdown {
  totalMinutes: number;       // bruto: shift_start → shift_end
  breakMinutes: number;
  mealMinutes: number;
  autoBreakMinutes: number;
  effectiveMinutes: number;   // total - break - meal - autoBreak
}

export function calcShiftMinutes(
  events: ReadonlyArray<TimeClockEventDocument>,
  // Cuándo "ahora" — si la jornada está abierta (shift_start sin shift_end),
  // usar `now` para calcular la duración como en progreso.
  now: Date | null = null,
): ShiftMinutesBreakdown {
  const shift = calcPairsDuration(events, 'shift_start', 'shift_end', now);
  const breaks = calcPairsDuration(events, 'break_start', 'break_end', now);
  const meals = calcPairsDuration(events, 'meal_start', 'meal_end', now);

  let autoBreakMinutes = 0;
  if (
    shift.totalMinutes > AUTO_BREAK_THRESHOLD_MIN &&
    breaks.totalMinutes + meals.totalMinutes < AUTO_BREAK_AMOUNT_MIN
  ) {
    autoBreakMinutes =
      AUTO_BREAK_AMOUNT_MIN - (breaks.totalMinutes + meals.totalMinutes);
  }

  return {
    totalMinutes: shift.totalMinutes,
    breakMinutes: breaks.totalMinutes,
    mealMinutes: meals.totalMinutes,
    autoBreakMinutes,
    effectiveMinutes: Math.max(
      0,
      shift.totalMinutes - breaks.totalMinutes - meals.totalMinutes - autoBreakMinutes,
    ),
  };
}

// ── Distribución LFT semanal ──────────────────────────────────────────────

export interface WeeklyOvertimeDistribution {
  regular: number;
  ot100: number;
  ot200: number;
}

// Distribuye un total semanal en regular / OT100 / OT200 según LFT.
export function distributeWeeklyOvertime(
  totalEffectiveMinutes: number,
): WeeklyOvertimeDistribution {
  if (totalEffectiveMinutes <= REGULAR_WEEKLY_LIMIT_MIN) {
    return { regular: totalEffectiveMinutes, ot100: 0, ot200: 0 };
  }
  const overtime = totalEffectiveMinutes - REGULAR_WEEKLY_LIMIT_MIN;
  if (overtime <= OT100_WEEKLY_LIMIT_MIN) {
    return { regular: REGULAR_WEEKLY_LIMIT_MIN, ot100: overtime, ot200: 0 };
  }
  return {
    regular: REGULAR_WEEKLY_LIMIT_MIN,
    ot100: OT100_WEEKLY_LIMIT_MIN,
    ot200: overtime - OT100_WEEKLY_LIMIT_MIN,
  };
}

// ── Helpers de fecha / horario ────────────────────────────────────────────

// "HH:MM" → minutos desde medianoche. No valida (asumimos input ya sano).
export function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Combina una fecha (yyyy-mm-dd) con un horario "HH:MM" en una Date UTC,
// interpretando el "HH:MM" como wall clock en la zona horaria de la org.
//
// Usar SIEMPRE esta versión cuando el `time` viene de un schedule (que
// representa una hora local del empleado) y queremos compararlo contra
// fichajes reales (que son instantes UTC).
//
// Ejemplo: workDate=2026-04-30T00:00:00Z, time="07:00", tz="America/Mexico_City"
//   → 2026-04-30T13:00:00Z (07:00 en UTC-6)
export function combineDateAndTimeInTimezone(
  date: Date,
  time: string,
  timezone: string,
): Date {
  const [h, m] = time.split(':').map(Number);
  // Punto de partida: el mismo time pero "interpretado como UTC".
  const tentative = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      h ?? 0,
      m ?? 0,
      0,
      0,
    ),
  );
  // Offset firmado de la timezone respecto a UTC en ese instante.
  // Si Mexico es UTC-6, offset = -360.
  const offsetMin = timezoneOffsetMinutes(tentative, timezone);
  // El tentative representa "HH:MM en UTC". Para que represente "HH:MM en
  // la timezone", restamos el offset (offset negativo → añadir horas).
  return new Date(tentative.getTime() - offsetMin * 60_000);
}

// DEPRECATED: úsa combineDateAndTimeInTimezone. Esta variante no respeta
// la timezone de la org y produce horarios esperados incorrectos para
// orgs fuera de UTC. Conservada por compatibilidad de firma.
export function combineDateAndTime(date: Date, time: string): Date {
  const minutes = parseTime(time);
  return new Date(date.getTime() + minutes * 60_000);
}

// Dado un instante UTC y la timezone de la org, devuelve el `workDate`
// (UTC-midnight) del día local en que cae ese instante.
//
// Ejemplo: instant=2026-05-05T00:19Z, tz=America/Mexico_City (UTC-5 en DST)
//   → wall-clock local = 2026-05-04 19:19 → workDate = 2026-05-04T00:00Z
//
// Esto es lo que necesitamos para asignar correctamente eventos a días de
// trabajo: un fichaje de salida a las 6:19 PM Mexico (00:19 UTC) pertenece
// al día de trabajo Mexico May 4, no al "May 5 UTC".
export function workDateInTimezone(instant: Date, timezone: string): Date {
  const offsetMin = timezoneOffsetMinutes(instant, timezone);
  // "Localiza" el instante: lo desplazamos por el offset para que su
  // representación UTC sea igual al wall-clock local.
  const localized = new Date(instant.getTime() + offsetMin * 60_000);
  return new Date(
    Date.UTC(
      localized.getUTCFullYear(),
      localized.getUTCMonth(),
      localized.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

// Dado un workDate (UTC-midnight que representa un día local) y la timezone,
// devuelve el rango de instantes UTC reales que caen en ese día local.
//
// Ejemplo: workDate=2026-05-04T00:00Z, tz=America/Mexico_City (UTC-5)
//   → start=2026-05-04T05:00:00Z, end=2026-05-05T04:59:59.999Z
export function localDayUtcRange(
  workDate: Date,
  timezone: string,
): { start: Date; end: Date } {
  const offsetMin = timezoneOffsetMinutes(workDate, timezone);
  const start = new Date(workDate.getTime() - offsetMin * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000 - 1);
  return { start, end };
}

// Offset firmado en minutos de una timezone respecto a UTC para una
// fecha específica. Útil para soportar DST cuando aplique.
function timezoneOffsetMinutes(date: Date, timezone: string): number {
  // Truco: formateamos la misma fecha en UTC y en la timezone, y la
  // diferencia entre ambas reconstrucciones nos da el offset.
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tz = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return Math.round((tz.getTime() - utc.getTime()) / 60_000);
}

// Formatea minutos como "Xh Ym" / "Xh" / "Ym". Para descripciones de
// anomalías, durations en logs/audit, etc.
export function formatMinutesAsHours(minutes: number): string {
  if (minutes < 1) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Inicio del día (00:00 UTC) y fin (23:59:59.999 UTC).
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

// Computa el rango [start, end] de un "shift" cuando el manager cierra una
// sesión de revisión. shiftPeriod permite separar mañana/tarde/noche del
// mismo día calendario.
export function computeShiftRange(
  shiftDate: Date,
  shiftPeriod: ShiftPeriod,
): { start: Date; end: Date } {
  const dayStart = startOfUtcDay(shiftDate);
  if (shiftPeriod === 'full_day') {
    return { start: dayStart, end: endOfUtcDay(shiftDate) };
  }
  if (shiftPeriod === 'morning') {
    // 06:00 → 13:59:59.999 UTC. Es referencial: la org puede ajustar.
    return {
      start: new Date(dayStart.getTime() + 6 * 60 * 60_000),
      end: new Date(dayStart.getTime() + 14 * 60 * 60_000 - 1),
    };
  }
  if (shiftPeriod === 'afternoon') {
    return {
      start: new Date(dayStart.getTime() + 14 * 60 * 60_000),
      end: new Date(dayStart.getTime() + 22 * 60 * 60_000 - 1),
    };
  }
  // night
  return {
    start: new Date(dayStart.getTime() + 22 * 60 * 60_000),
    end: endOfUtcDay(shiftDate),
  };
}

// Deadline esperado para cerrar una sesión: 24h después del fin del shift.
export function computeReviewDeadline(
  shiftDate: Date,
  shiftPeriod: ShiftPeriod,
): Date {
  const { end } = computeShiftRange(shiftDate, shiftPeriod);
  return new Date(end.getTime() + 24 * 60 * 60_000);
}

// ── Comparaciones de "esperado vs actual" ─────────────────────────────────

// Construye el ShiftSummary partiendo de los eventos + esperados del schedule.
export interface BuildShiftSummaryArgs {
  events: ReadonlyArray<TimeClockEventDocument>;
  expectedStart: Date | null;
  expectedEnd: Date | null;
  // Cuándo "ahora". Default Date.now(). Inyectable para tests y para que
  // las jornadas en progreso (shift_start sin shift_end) muestren minutos
  // acumulados hasta el momento del recálculo.
  now?: Date;
}

export function buildShiftSummary(args: BuildShiftSummaryArgs): ShiftSummary {
  const { events, expectedStart, expectedEnd } = args;
  const now = args.now ?? new Date();

  const startEvt = events
    .filter((e) => e.type === 'shift_start' && !e.isExcluded)
    .sort((a, b) => a.clockedAt.getTime() - b.clockedAt.getTime())[0];
  const endEvt = events
    .filter((e) => e.type === 'shift_end' && !e.isExcluded)
    .sort((a, b) => b.clockedAt.getTime() - a.clockedAt.getTime())[0];

  const actualStart = startEvt?.clockedAt ?? null;
  const actualEnd = endEvt?.clockedAt ?? null;

  // Si la jornada está abierta (start sin end), usar `now` para que el
  // breakdown refleje el "trabajando" en vivo en lugar de devolver 0.
  const fallbackEnd = actualStart && !actualEnd ? now : null;
  const breakdown = calcShiftMinutes(events, fallbackEnd);

  let lateMinutes = 0;
  let isLate = false;
  if (actualStart && expectedStart) {
    lateMinutes = Math.max(
      0,
      Math.round((actualStart.getTime() - expectedStart.getTime()) / 60_000),
    );
    isLate = lateMinutes > TOLERANCE_LATE_MINUTES;
  }

  let earlyLeaveMinutes = 0;
  let isEarlyLeave = false;
  if (actualEnd && expectedEnd) {
    earlyLeaveMinutes = Math.max(
      0,
      Math.round((expectedEnd.getTime() - actualEnd.getTime()) / 60_000),
    );
    isEarlyLeave = earlyLeaveMinutes > TOLERANCE_LATE_MINUTES;
  }

  // Distribución LFT del día: lo único que sabemos seguro es que el
  // efectivo del día es la base para regular + OT diario simple. La
  // distribución semanal completa la calcula otro paso al cerrar la semana.
  const dailyRegular = Math.min(breakdown.effectiveMinutes, REGULAR_DAILY_LIMIT_MIN);
  const dailyOvertime = Math.max(0, breakdown.effectiveMinutes - REGULAR_DAILY_LIMIT_MIN);

  return {
    expectedStart,
    expectedEnd,
    actualStart,
    actualEnd,
    durationMinutes: breakdown.totalMinutes,
    regularMinutes: dailyRegular,
    overtime100Minutes: dailyOvertime,
    overtime200Minutes: 0,
    holidayMinutes: 0,
    breakMinutes: breakdown.breakMinutes,
    mealMinutes: breakdown.mealMinutes + breakdown.autoBreakMinutes,
    isLate,
    lateMinutes,
    isEarlyLeave,
    earlyLeaveMinutes,
  };
}
