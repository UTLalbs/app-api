import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type TimeClockEventType =
  | 'shift_start'
  | 'shift_end'
  | 'location_arrival'
  | 'location_departure'
  | 'break_start'
  | 'break_end'
  | 'meal_start'
  | 'meal_end';

export type ClockSource =
  | 'web'
  | 'mobile'
  | 'kiosk'
  | 'auto_detected'
  | 'manual_correction';

export type GeofenceStatus = 'inside' | 'outside' | 'no_reference';

export type ClockReviewStatus =
  | 'auto_ok'
  | 'pending'
  | 'resolved_ok'
  | 'resolved_action';

export type TimeClockDayStatus =
  | 'scheduled_no_clockin'
  | 'in_progress'
  | 'completed'
  | 'completed_with_issues'
  | 'absence'
  | 'no_schedule';

export type ShiftPeriod = 'morning' | 'afternoon' | 'night' | 'full_day';

export type AnomalyType =
  | 'shift_late_arrival'
  | 'shift_early_departure'
  | 'shift_missing_clockin'
  | 'shift_missing_clockout'
  | 'service_late_arrival'
  | 'service_early_departure'
  | 'service_missing'
  | 'service_extended'
  | 'out_of_geofence'
  | 'overtime_unplanned'
  | 'manual_correction_applied';

export type AnomalySeverity = 'info' | 'warning' | 'critical';

export type ResolutionType =
  | 'absence_justified'
  | 'absence_unjustified'
  | 'manual_correction'
  | 'accepted_as_reported'
  | 'incident_raised'
  | 'tardiness_justified'
  | 'early_departure_justified'
  | 'early_departure_unjustified'
  | 'event_excluded';

export type AffectedRole = 'rrhh' | 'operations' | 'client';

// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface ReportedLocationDocument {
  // [lng, lat]; null si el dispositivo denegó permiso o no soporta GPS.
  coordinates: [number, number] | null;
  accuracyMeters: number | null;
  capturedAt: Date;
}

export interface ReportedLocation {
  coordinates: [number, number] | null;
  accuracyMeters: number | null;
  capturedAt: Date;
}

export interface ClockDeviceDocument {
  ip: string | null;
  userAgent: string | null;
  // Cookie persistente per device (futuro). Hoy queda null.
  deviceId: string | null;
}

export interface ClockDevice {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

export interface EventDenormalizedRefs {
  userName: string;
  userPosition: string | null;
  expectedLocationName: string | null;
  expectedLocationColor: string | null;
}

// ── Evento individual ──────────────────────────────────────────────────────

export interface TimeClockEventDocument {
  _id: ObjectId;
  orgId: ObjectId;

  userId: ObjectId;

  type: TimeClockEventType;
  clockedAt: Date;
  // String preformateado para auditoría / lectura humana sin reconvertir tz.
  clockedAtLocal: string;

  scheduleId: ObjectId | null;
  periodId: ObjectId | null;
  serviceCommitmentId: ObjectId | null;

  reportedLocation: ReportedLocationDocument | null;

  expectedLocationId: ObjectId | null;
  geofenceStatus: GeofenceStatus;
  distanceFromExpectedMeters: number | null;

  source: ClockSource;

  correctedBy: ObjectId | null;
  correctionReason: string | null;
  correctsEventId: ObjectId | null;

  isExcluded: boolean;
  excludedBy: ObjectId | null;
  excludedAt: Date | null;
  exclusionReason: string | null;

  device: ClockDeviceDocument;

  reviewStatus: ClockReviewStatus;
  reviewedBy: ObjectId | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  reviewSessionId: ObjectId | null;

  notes: string | null;

  // AI-ready (placeholders v1)
  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: EventDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TimeClockEvent {
  id: string;
  orgId: string;

  userId: string;

  type: TimeClockEventType;
  clockedAt: Date;
  clockedAtLocal: string;

  scheduleId: string | null;
  periodId: string | null;
  serviceCommitmentId: string | null;

  reportedLocation: ReportedLocation | null;

  expectedLocationId: string | null;
  geofenceStatus: GeofenceStatus;
  distanceFromExpectedMeters: number | null;

  source: ClockSource;

  correctedBy: string | null;
  correctionReason: string | null;
  correctsEventId: string | null;

  isExcluded: boolean;
  excludedBy: string | null;
  excludedAt: Date | null;
  exclusionReason: string | null;

  device: ClockDevice;

  reviewStatus: ClockReviewStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  reviewSessionId: string | null;

  notes: string | null;

  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: EventDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;
}

// ── Día agregado ───────────────────────────────────────────────────────────

export interface ShiftSummary {
  expectedStart: Date | null;
  expectedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  durationMinutes: number;

  // LFT
  regularMinutes: number;
  overtime100Minutes: number;
  overtime200Minutes: number;
  holidayMinutes: number;
  breakMinutes: number;
  mealMinutes: number;

  isLate: boolean;
  lateMinutes: number;
  isEarlyLeave: boolean;
  earlyLeaveMinutes: number;
}

export interface ServiceVisitSummaryDocument {
  commitmentId: ObjectId | null;
  locationId: ObjectId;
  locationName: string;

  expectedStart: Date | null;
  expectedEnd: Date | null;
  actualArrival: Date | null;
  actualDeparture: Date | null;
  durationMinutes: number;

  arrivedOnTime: boolean | null;
  departedOnTime: boolean | null;
  delayMinutes: number;

  serviceCompleted: boolean;
}

export interface ServiceVisitSummary {
  commitmentId: string | null;
  locationId: string;
  locationName: string;

  expectedStart: Date | null;
  expectedEnd: Date | null;
  actualArrival: Date | null;
  actualDeparture: Date | null;
  durationMinutes: number;

  arrivedOnTime: boolean | null;
  departedOnTime: boolean | null;
  delayMinutes: number;

  serviceCompleted: boolean;
}

export interface TimeClockAnomalyDocument {
  // Sub-id estable para apuntar la anomalía cuando se resuelva.
  _id: ObjectId;

  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  affectsRole: AffectedRole[];
  affectedEventId: ObjectId | null;
  affectedLocationId: ObjectId | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: ObjectId | null;
  resolutionType: ResolutionType | null;
  resolutionNotes: string | null;
}

export interface TimeClockAnomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  affectsRole: AffectedRole[];
  affectedEventId: string | null;
  affectedLocationId: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionType: ResolutionType | null;
  resolutionNotes: string | null;
}

export interface DayDenormalizedRefs {
  userName: string;
  userPosition: string | null;
}

export interface TimeClockDayDocument {
  _id: ObjectId;
  orgId: ObjectId;

  userId: ObjectId;
  workDate: Date;

  scheduleId: ObjectId | null;

  status: TimeClockDayStatus;

  events: ObjectId[];

  shift: ShiftSummary;

  serviceVisits: ServiceVisitSummaryDocument[];
  totalServiceMinutes: number;

  anomalies: TimeClockAnomalyDocument[];

  reviewStatus: ClockReviewStatus;
  pendingItemsCount: number;

  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: DayDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;
}

export interface TimeClockDay {
  id: string;
  orgId: string;

  userId: string;
  workDate: string;     // ISO yyyy-mm-dd

  scheduleId: string | null;

  status: TimeClockDayStatus;

  events: string[];

  shift: ShiftSummary;

  serviceVisits: ServiceVisitSummary[];
  totalServiceMinutes: number;

  anomalies: TimeClockAnomaly[];

  reviewStatus: ClockReviewStatus;
  pendingItemsCount: number;

  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: DayDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;

  // Marcador frontend-only: true si el Day fue derivado del workSchedule del
  // empleado (no existe en BD). Al fichar o resolver una anomalía se materializa.
  __virtual?: boolean;
}

// ── Sesión de revisión ─────────────────────────────────────────────────────

export type ResolutionsByType = Partial<Record<ResolutionType, number>>;

export interface ClockReviewSessionDocument {
  _id: ObjectId;
  orgId: ObjectId;

  shiftDate: Date;
  shiftPeriod: ShiftPeriod;

  reviewedBy: ObjectId;
  startedAt: Date;
  closedAt: Date;

  totalEmployees: number;
  totalEventsReviewed: number;
  totalPendingResolved: number;
  totalAnomaliesResolved: number;

  resolutionsByType: ResolutionsByType;

  notes: string | null;

  isLateReview: boolean;

  llmSummary: string | null;
  humanReadableId: string | null;

  createdAt: Date;
}

export interface ClockReviewSession {
  id: string;
  orgId: string;

  shiftDate: string;     // ISO yyyy-mm-dd
  shiftPeriod: ShiftPeriod;

  reviewedBy: string;
  startedAt: Date;
  closedAt: Date;

  totalEmployees: number;
  totalEventsReviewed: number;
  totalPendingResolved: number;
  totalAnomaliesResolved: number;

  resolutionsByType: ResolutionsByType;

  notes: string | null;

  isLateReview: boolean;

  llmSummary: string | null;
  humanReadableId: string | null;

  createdAt: Date;
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateEventDto {
  userId: string;
  type: TimeClockEventType;
  clockedAt: Date | null;        // null → backend usa Date.now()
  scheduleId: string | null;
  periodId: string | null;
  serviceCommitmentId: string | null;
  reportedLocation: ReportedLocation | null;
  notes: string | null;
}

export interface CreateManualEventDto {
  userId: string;
  type: TimeClockEventType;
  clockedAt: Date;
  expectedLocationId: string;
  correctionReason: string;
  correctsEventId: string | null;
  notes: string | null;
}

export interface ExcludeEventDto {
  exclusionReason: string;
}

export interface ListEventsFilter {
  userId?: string;
  startDate: Date;
  endDate: Date;
  type?: TimeClockEventType;
  reviewStatus?: ClockReviewStatus | 'all';
  page: number;
  pageSize: number;
}

export interface ListDaysFilter {
  // Modo turno único (página de revisión por shift).
  shiftDate?: Date;
  // Modo rango (historial de fichajes por empleado).
  shiftDateFrom?: Date;
  shiftDateTo?: Date;
  shiftPeriod: ShiftPeriod;
  tab:
    | 'missing_clockin'
    | 'late_arrivals'
    | 'anomalies'
    | 'in_progress'
    | 'closed'
    | 'absences'
    | 'all';
  userId?: string;
  departmentKey?: string;
  positionKey?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ResolveAnomalyDto {
  resolutionType: ResolutionType;
  resolutionNotes: string | null;
  correctedClockedAt: Date | null;
  correctedLocationId: string | null;
}

export interface CloseSessionDto {
  shiftDate: Date;
  shiftPeriod: ShiftPeriod;
  notes: string | null;
}

export interface ListSessionsFilter {
  shiftDateFrom?: Date;
  shiftDateTo?: Date;
  reviewedBy?: string;
  page: number;
  pageSize: number;
}

// ── Vistas auxiliares ──────────────────────────────────────────────────────

// Estado actual del usuario para el widget de la topbar / página "Mi fichaje".
export interface MyClockStatus {
  currentState:
    | 'no_schedule'           // sin schedule programado
    | 'before_shift'          // tiene schedule pero aún no inició
    | 'clocked_in'            // shift_start emitido, sin shift_end
    | 'on_break'              // dentro de break/meal
    | 'at_service'            // dentro de location_arrival sin departure
    | 'completed'             // shift_end emitido
    | 'absence';              // ausencia aprobada vigente
  schedule: {
    id: string;
    workDate: string;
    expectedStart: string | null;
    expectedEnd: string | null;
    expectedStartLocationId: string | null;
    expectedStartLocationName: string | null;
    expectedEndLocationId: string | null;
    expectedEndLocationName: string | null;
  } | null;
  lastEvent: TimeClockEvent | null;
  todayDay: TimeClockDay | null;
  activeAbsenceCategoryName: string | null;
}

export interface PendingByTabResponse {
  counts: Record<
    | 'missing_clockin'
    | 'late_arrivals'
    | 'anomalies'
    | 'in_progress'
    | 'closed'
    | 'absences',
    number
  >;
  shiftDate: string;
  shiftPeriod: ShiftPeriod;
}

export interface ActiveEmployeeSummary {
  userId: string;
  userName: string;
  userPosition: string | null;
  shiftStartedAt: Date;
  expectedLocationId: string | null;
  expectedLocationName: string | null;
  currentState: MyClockStatus['currentState'];
}
