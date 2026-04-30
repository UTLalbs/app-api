// ── Helpers compartidos del módulo absences ───────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Normaliza una fecha a las 00:00 UTC del mismo día calendario.
// Las solicitudes guardan startDate/endDate como medianoche UTC para que
// las comparaciones de rango sean estables sin problemas de zona horaria.
export function normalizeAbsenceDate(date: Date | string): Date {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

// Cuenta días naturales (inclusive) y días hábiles (lunes a viernes).
// Para categorías que cuentan contra el saldo solo se usa `totalDaysWorking`.
export function calcDays(
  startDate: Date,
  endDate: Date,
): { totalDaysNatural: number; totalDaysWorking: number } {
  const start = normalizeAbsenceDate(startDate);
  const end = normalizeAbsenceDate(endDate);

  if (end < start) return { totalDaysNatural: 0, totalDaysWorking: 0 };

  const totalDaysNatural =
    Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  let totalDaysWorking = 0;
  for (let i = 0; i < totalDaysNatural; i++) {
    const day = new Date(start.getTime() + i * MS_PER_DAY);
    const dow = day.getUTCDay(); // 0 = domingo (único día no laboral)
    if (dow !== 0) totalDaysWorking += 1;
  }

  return { totalDaysNatural, totalDaysWorking };
}

// Devuelve la cantidad de días de vacaciones según LFT 2023 (reforma de
// vacaciones dignas) en función de los años cumplidos de servicio.
//   < 1 año  → 0 (no acumula aún)
//   1 año    → 12
//   2 años   → 14
//   3 años   → 16
//   4 años   → 18
//   5 años   → 20
//   ≥ 6      → 20 + 2 cada 5 años cumplidos a partir del quinto.
export function calcVacationDaysLFT(yearsOfService: number): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService === 1) return 12;
  if (yearsOfService === 2) return 14;
  if (yearsOfService === 3) return 16;
  if (yearsOfService === 4) return 18;
  if (yearsOfService === 5) return 20;
  const extraBlocks = Math.floor((yearsOfService - 5) / 5);
  return 20 + extraBlocks * 2;
}

// Calcula años completos entre dateOfHire y referenceDate.
export function yearsOfService(dateOfHire: Date, referenceDate: Date): number {
  const diffMs = referenceDate.getTime() - dateOfHire.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (365.25 * MS_PER_DAY));
}

// Genera un humanReadableId tipo "ABS-2026-04-XXXX" a partir de un sufijo
// derivado del ObjectId (4 últimos hex). Mantiene paridad con el spec sin
// requerir un secuencial transaccional.
export function generateHumanReadableId(
  prefix: string,
  date: Date,
  idSuffix: string,
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const tail = idSuffix.slice(-4).toUpperCase();
  return `${prefix}-${year}-${month}-${tail}`;
}

// Determina si dos rangos [a1,a2] y [b1,b2] (inclusive) se traslapan.
export function rangesOverlap(
  a1: Date,
  a2: Date,
  b1: Date,
  b2: Date,
): boolean {
  return a1 <= b2 && b1 <= a2;
}
