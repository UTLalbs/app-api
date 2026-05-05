import type {
	DayOfWeek,
	DayShiftDocument,
	EmployeeWorkScheduleDocument,
	JornadaType,
	WeeklyPatternDocument,
} from "./employee.types";

// ── Constantes legales (LFT 2026) ──────────────────────────────────────────
//
// Las horas máximas son las que reconoce la LFT al 2026-05-04. La iniciativa
// de jornada de 40h aún no está aprobada — si pasa, basta con tocar este map.

export const LFT_LIMITS: Record<
	JornadaType,
	{maxPerDay: number; maxPerWeek: number}
> = {
	diurna: {maxPerDay: 8, maxPerWeek: 48},
	nocturna: {maxPerDay: 7, maxPerWeek: 42},
	mixta: {maxPerDay: 7.5, maxPerWeek: 45},
	// Acumuladas se evalúan por promedio semanal (LFT art. 59); permitimos
	// hasta 12h/día siempre que el promedio respete el máximo de la jornada
	// equivalente. Tope del rango = 48h/sem como referencia diurna.
	acumulada: {maxPerDay: 12, maxPerWeek: 48},
	// por_viaje se rige por NOM-087 (validador aparte). Aquí dejamos límites
	// laxos para que las violaciones reales las marque la NOM.
	por_viaje: {maxPerDay: 14, maxPerWeek: 60},
};

const DAYS_OF_WEEK: DayOfWeek[] = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];

// ── Tipos de salida ────────────────────────────────────────────────────────

export type ScheduleWarningRule =
	| "lft_max_hours_day"
	| "lft_max_hours_week"
	| "lft_no_rest_day"
	| "nom087_continuous_drive"
	| "nom087_max_jornada_24h"
	| "nom087_min_rest_between"
	| "jornada_misclassified"
	| "pattern_missing";

export interface ScheduleWarning {
	rule: ScheduleWarningRule;
	severity: "info" | "warning" | "error";
	message: string;
	details?: Record<string, unknown>;
}

// ── Utilidades de tiempo ───────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

// Devuelve la duración en minutos de un turno, manejando wrap (cruza medianoche).
// Resta el descanso siguiendo la prioridad:
//   1) ventana explícita (breakStartTime/breakEndTime) — la más exacta.
//   2) duración implícita (breakDurationMinutes) si applyAutoBreak.
function shiftDurationMinutes(shift: DayShiftDocument): number {
	const start = timeToMinutes(shift.startTime);
	const end = timeToMinutes(shift.endTime);
	const dayMinutes = 24 * 60;
	let total: number;
	if (shift.multiDay) {
		total = end + shift.endDayOffset * dayMinutes - start;
	} else if (end >= start) {
		total = end - start;
	} else {
		total = dayMinutes - start + end;
	}

	if (shift.breakStartTime && shift.breakEndTime) {
		const breakMinutes = Math.max(
			0,
			timeToMinutes(shift.breakEndTime) -
				timeToMinutes(shift.breakStartTime),
		);
		total -= breakMinutes;
	} else if (shift.applyAutoBreak) {
		total -= shift.breakDurationMinutes;
	}

	return Math.max(total, 0);
}

// ¿Cuántos minutos del turno caen en el rango nocturno LFT (20:00-06:00)?
function nightMinutes(shift: DayShiftDocument): number {
	const NIGHT_START = 20 * 60; // 20:00
	const DAY_START = 6 * 60; // 06:00
	const start = timeToMinutes(shift.startTime);
	const end = timeToMinutes(shift.endTime);
	const dayMinutes = 24 * 60;

	// Materializamos el turno como segmentos lineales en una línea de tiempo
	// arrancando en `start` y avanzando `duration` minutos. Luego intersectamos
	// con cada ventana nocturna [20:00, 30:00) (=20:00-06:00 día sig).
	let duration: number;
	if (shift.multiDay) {
		duration = end + shift.endDayOffset * dayMinutes - start;
	} else if (end >= start) {
		duration = end - start;
	} else {
		duration = dayMinutes - start + end;
	}
	if (duration <= 0) return 0;

	const shiftStart = start;
	const shiftEnd = start + duration;

	// Rango nocturno LFT: 20:00-30:00 (=06:00 día siguiente). Repetimos el patrón
	// cada 24h hasta cubrir el turno (cubre multi-day correctamente).
	let nightTotal = 0;
	for (
		let dayOffset = 0;
		dayOffset * dayMinutes <= shiftEnd;
		dayOffset++
	) {
		const nightStart = NIGHT_START + dayOffset * dayMinutes;
		const nightEnd = DAY_START + (dayOffset + 1) * dayMinutes;
		const overlapStart = Math.max(shiftStart, nightStart);
		const overlapEnd = Math.min(shiftEnd, nightEnd);
		if (overlapEnd > overlapStart) nightTotal += overlapEnd - overlapStart;
	}
	return nightTotal;
}

// ── Clasificador de jornada ────────────────────────────────────────────────

// Calcula la jornada que las franjas reales del patrón implicarían, según
// LFT art. 60. Útil para detectar mismatch con jornadaType declarada.
export function classifyJornada(
	pattern: WeeklyPatternDocument,
): JornadaType {
	let nightTotal = 0;
	let workedTotal = 0;
	for (const day of DAYS_OF_WEEK) {
		const shift = pattern[day];
		if (!shift) continue;
		nightTotal += nightMinutes(shift);
		workedTotal += shiftDurationMinutes(shift);
	}
	if (workedTotal === 0) return "diurna";
	const nightRatio = nightTotal / workedTotal;
	// Si toda la jornada es nocturna → nocturna.
	if (nightRatio >= 0.95) return "nocturna";
	// LFT art. 60: si el periodo nocturno excede 3.5h en la jornada mixta,
	// se reputa nocturna completa. Aproximamos sobre el promedio diario.
	const daysWorked = DAYS_OF_WEEK.filter((d) => pattern[d]).length;
	const avgNightPerDay = nightTotal / Math.max(daysWorked, 1);
	if (avgNightPerDay > 3.5 * 60) return "nocturna";
	if (nightTotal === 0) return "diurna";
	return "mixta";
}

// ── Validadores ────────────────────────────────────────────────────────────

function getPattern(
	schedule: EmployeeWorkScheduleDocument,
): WeeklyPatternDocument | null {
	// Si solo hay templateId (sin customPattern hidratado), el llamador debe
	// hidratar antes; aquí solo evaluamos lo que tenemos.
	return schedule.customPattern;
}

export function validateLftLimits(
	schedule: EmployeeWorkScheduleDocument,
): ScheduleWarning[] {
	const pattern = getPattern(schedule);
	if (!pattern) return [];
	const warnings: ScheduleWarning[] = [];
	const limits = LFT_LIMITS[schedule.jornadaType];
	let weekMinutes = 0;

	for (const day of DAYS_OF_WEEK) {
		const shift = pattern[day];
		if (!shift) continue;
		const dayMinutes = shiftDurationMinutes(shift);
		weekMinutes += dayMinutes;
		const dayHours = dayMinutes / 60;
		if (dayHours > limits.maxPerDay) {
			warnings.push({
				rule: "lft_max_hours_day",
				severity: "warning",
				message: `${day}: ${dayHours.toFixed(2)}h excede el máximo de ${limits.maxPerDay}h/día para jornada ${schedule.jornadaType} (LFT art. 61).`,
				details: {day, hours: dayHours, max: limits.maxPerDay},
			});
		}
	}

	const weekHours = weekMinutes / 60;
	const cap = Math.min(schedule.weeklyMaxHours, limits.maxPerWeek);
	if (weekHours > cap) {
		warnings.push({
			rule: "lft_max_hours_week",
			severity: "warning",
			message: `Total semanal ${weekHours.toFixed(2)}h excede ${cap}h (LFT art. 61). Las horas extras tienen tope legal de 9h/sem.`,
			details: {weekHours, cap},
		});
	}
	return warnings;
}

export function validateRestDays(
	schedule: EmployeeWorkScheduleDocument,
): ScheduleWarning[] {
	const pattern = getPattern(schedule);
	if (!pattern) return [];
	// Día de descanso = explícitamente listado en restDays O sin turno asignado.
	const daysWithoutShift = DAYS_OF_WEEK.filter((d) => !pattern[d]);
	const totalRestDays = new Set([
		...schedule.restDays,
		...daysWithoutShift,
	]).size;
	if (totalRestDays < 1) {
		return [
			{
				rule: "lft_no_rest_day",
				severity: "warning",
				message:
					"El patrón no incluye día de descanso semanal — la LFT art. 69 obliga a 1 día por cada 6 trabajados.",
				details: {restDays: schedule.restDays},
			},
		];
	}
	return [];
}

// NOM-087-SCT-2-2017 — operadores de autotransporte federal:
//   • Conducción continua máx 5h, luego 30 min descanso
//   • Jornada de conducción máx 14h en ventana de 24h
//   • Mínimo 8h de descanso entre jornadas
export function validateNom087(
	schedule: EmployeeWorkScheduleDocument,
): ScheduleWarning[] {
	if (schedule.jornadaType !== "por_viaje") return [];
	const pattern = getPattern(schedule);
	if (!pattern) return [];
	const warnings: ScheduleWarning[] = [];

	const MAX_CONTINUOUS = 5 * 60;
	const MAX_JORNADA_24H = 14 * 60;
	const MIN_REST_BETWEEN = 8 * 60;

	for (const day of DAYS_OF_WEEK) {
		const shift = pattern[day];
		if (!shift) continue;
		const duration = shiftDurationMinutes(shift);
		// 5h continuas: si applyAutoBreak es false o el break es <30 min y la
		// duración total excede 5h, marcamos.
		if (
			duration > MAX_CONTINUOUS &&
			(!shift.applyAutoBreak || shift.breakDurationMinutes < 30)
		) {
			warnings.push({
				rule: "nom087_continuous_drive",
				severity: "warning",
				message: `${day}: jornada de ${(duration / 60).toFixed(2)}h sin descanso de 30 min — NOM-087 exige descanso tras 5h continuas de conducción.`,
				details: {day, duration},
			});
		}
		if (duration > MAX_JORNADA_24H) {
			warnings.push({
				rule: "nom087_max_jornada_24h",
				severity: "warning",
				message: `${day}: jornada de ${(duration / 60).toFixed(2)}h excede el máximo de 14h en 24h (NOM-087).`,
				details: {day, duration},
			});
		}
	}

	// Descanso mínimo entre jornadas de días consecutivos.
	for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
		const today = DAYS_OF_WEEK[i];
		const tomorrow = DAYS_OF_WEEK[(i + 1) % DAYS_OF_WEEK.length];
		const todayShift = pattern[today];
		const tomorrowShift = pattern[tomorrow];
		if (!todayShift || !tomorrowShift) continue;

		const todayEnd =
			timeToMinutes(todayShift.startTime) + shiftDurationMinutes(todayShift);
		// Tiempo entre fin del turno de hoy y arranque del de mañana.
		const tomorrowStart = 24 * 60 + timeToMinutes(tomorrowShift.startTime);
		const restBetween = tomorrowStart - todayEnd;
		if (restBetween < MIN_REST_BETWEEN) {
			warnings.push({
				rule: "nom087_min_rest_between",
				severity: "warning",
				message: `Entre ${today} y ${tomorrow}: descanso de ${(restBetween / 60).toFixed(2)}h — NOM-087 exige mínimo 8h continuas entre jornadas.`,
				details: {from: today, to: tomorrow, restBetween},
			});
		}
	}
	return warnings;
}

export function validateJornadaClassification(
	schedule: EmployeeWorkScheduleDocument,
): ScheduleWarning[] {
	const pattern = getPattern(schedule);
	if (!pattern) return [];
	// Solo aplica para tipos LFT estándar; acumulada/por_viaje tienen sus
	// propias reglas.
	if (
		schedule.jornadaType !== "diurna" &&
		schedule.jornadaType !== "nocturna" &&
		schedule.jornadaType !== "mixta"
	) {
		return [];
	}
	const computed = classifyJornada(pattern);
	if (computed !== schedule.jornadaType) {
		return [
			{
				rule: "jornada_misclassified",
				severity: "warning",
				message: `Jornada declarada '${schedule.jornadaType}' pero el patrón corresponde a '${computed}' según LFT art. 60.`,
				details: {declared: schedule.jornadaType, computed},
			},
		];
	}
	return [];
}

// Orquesta todas las validaciones. NO lanza — devuelve lista plana de
// advertencias para que la capa superior decida (D4 = advertir, no bloquear).
export function validateWorkSchedule(
	schedule: EmployeeWorkScheduleDocument,
): ScheduleWarning[] {
	if (!schedule.customPattern && !schedule.templateId) {
		return [
			{
				rule: "pattern_missing",
				severity: "error",
				message:
					"workSchedule no tiene templateId ni customPattern — al menos uno debe definirse.",
			},
		];
	}
	return [
		...validateJornadaClassification(schedule),
		...validateLftLimits(schedule),
		...validateRestDays(schedule),
		...validateNom087(schedule),
	];
}
