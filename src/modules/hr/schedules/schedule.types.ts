import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type ShiftType =
  | 'regular'    // empleado en una sola ubicación toda la jornada
  | 'mixed'      // jornada que combina yarda + cliente (operadores fronterizos)
  | 'inhouse'    // jornada completa en cliente
  | 'multi_day'  // turno que cruza varios días
  | 'coverage'   // cubre a otro empleado
  | 'training';  // capacitación, sin compromisos

export type AssignmentStatus = 'draft' | 'published';

export type ConflictType =
  | 'absence_overlap'
  | 'weekly_overtime'
  | 'double_booking'
  | 'rest_violation';

export type ConflictSeverity = 'info' | 'warning' | 'critical';

// ── Subdocumentos compartidos ──────────────────────────────────────────────

export interface DenormalizedRefs {
  userName: string | null;
  userPosition: string | null;
  createdByName: string | null;
  updatedByName: string | null;
}

// ── Service Commitment ─────────────────────────────────────────────────────

export interface ServiceCommitmentDocument {
  _id: ObjectId;
  locationId: ObjectId;
  startTime: string;        // 'HH:MM'
  endTime: string;          // 'HH:MM'
  serviceType: string | null;
  clientReference: string | null;
  isMandatory: boolean;
  arrivalTolerance: number; // minutos
  notes: string | null;
}

export interface ServiceCommitment {
  id: string;
  locationId: string;
  locationName: string | null; // populated en service via lookup
  startTime: string;
  endTime: string;
  serviceType: string | null;
  clientReference: string | null;
  isMandatory: boolean;
  arrivalTolerance: number;
  notes: string | null;
}

// ── Work Period ────────────────────────────────────────────────────────────

export interface WorkPeriodDocument {
  _id: ObjectId;

  shiftType: ShiftType;
  startTime: string;
  endTime: string;

  multiDay: boolean;
  endDayOffset: number;
  expectedDurationDays: number | null;

  startLocationId: ObjectId;
  endLocationId: ObjectId;

  serviceCommitments: ServiceCommitmentDocument[];

  applyAutoBreak: boolean;
  breakDurationMinutes: number;
  // Ventana explícita de descanso (opcional). Si ambos están definidos,
  // posicionan el break dentro de [startTime, endTime].
  breakStartTime: string | null;
  breakEndTime: string | null;

  coveringForUserId: ObjectId | null;
  coverageReason: string | null;

  notes: string | null;
}

export interface WorkPeriod {
  id: string;

  shiftType: ShiftType;
  startTime: string;
  endTime: string;

  multiDay: boolean;
  endDayOffset: number;
  expectedDurationDays: number | null;

  startLocationId: string;
  startLocationName: string | null;
  endLocationId: string;
  endLocationName: string | null;

  serviceCommitments: ServiceCommitment[];

  applyAutoBreak: boolean;
  breakDurationMinutes: number;
  breakStartTime: string | null;
  breakEndTime: string | null;

  coveringForUserId: string | null;
  coverageReason: string | null;

  notes: string | null;
}

// ── Schedule Template ──────────────────────────────────────────────────────

export interface TemplateCommitmentDocument {
  locationId: ObjectId;
  startTime: string;
  endTime: string;
  serviceType: string | null;
  isMandatory: boolean;
  arrivalTolerance: number;
}

export interface TemplateCommitment {
  locationId: string;
  startTime: string;
  endTime: string;
  serviceType: string | null;
  isMandatory: boolean;
  arrivalTolerance: number;
}

export interface ScheduleTemplateDocument {
  _id: ObjectId;
  orgId: ObjectId;

  name: string;
  description: string | null;

  shiftType: ShiftType;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultStartLocationId: ObjectId | null;
  defaultEndLocationId: ObjectId | null;

  defaultServiceCommitments: TemplateCommitmentDocument[];

  applyAutoBreak: boolean;
  breakDurationMinutes: number;

  isActive: boolean;
  isSystem: boolean;

  colorHex: string | null;

  // AI-ready (placeholders v1)
  llmSummary: string | null;
  humanReadableId: string | null;

  createdBy: ObjectId;
  updatedBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ScheduleTemplate {
  id: string;
  orgId: string;

  name: string;
  description: string | null;

  shiftType: ShiftType;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultStartLocationId: string | null;
  defaultEndLocationId: string | null;

  defaultServiceCommitments: TemplateCommitment[];

  applyAutoBreak: boolean;
  breakDurationMinutes: number;

  isActive: boolean;
  isSystem: boolean;

  colorHex: string | null;

  llmSummary: string | null;
  humanReadableId: string | null;

  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schedule Assignment ────────────────────────────────────────────────────

export interface ScheduleAssignmentDocument {
  _id: ObjectId;
  orgId: ObjectId;

  userId: ObjectId;
  workDate: Date;            // normalizado a 00:00 UTC

  fromTemplateId: ObjectId | null;

  periods: WorkPeriodDocument[];

  status: AssignmentStatus;
  publishedAt: Date | null;
  publishedBy: ObjectId | null;

  isCoverageOf: ObjectId | null;
  isCoveredBy: ObjectId | null;

  notes: string | null;

  // AI-ready (placeholders v1)
  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: DenormalizedRefs;

  createdBy: ObjectId;
  updatedBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ScheduleConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  affectedPeriodId: string | null;
  details: Record<string, unknown>;
}

export interface Schedule {
  id: string;
  orgId: string;

  userId: string;
  workDate: string;          // ISO date (yyyy-mm-dd)

  fromTemplateId: string | null;

  periods: WorkPeriod[];

  status: AssignmentStatus;
  publishedAt: string | null;
  publishedBy: string | null;

  isCoverageOf: string | null;
  isCoveredBy: string | null;

  notes: string | null;

  // Calculados (no en DB)
  totalMinutes: number;
  serviceMinutes: number;

  // Conflictos detectados al consultar/crear
  conflicts: ScheduleConflict[];

  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: DenormalizedRefs;

  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface ServiceCommitmentDto {
  locationId: string;
  startTime: string;
  endTime: string;
  serviceType: string | null;
  clientReference: string | null;
  isMandatory: boolean;
  arrivalTolerance: number;
  notes: string | null;
}

export interface WorkPeriodDto {
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  multiDay: boolean;
  endDayOffset: number;
  expectedDurationDays: number | null;
  startLocationId: string;
  endLocationId: string;
  serviceCommitments: ServiceCommitmentDto[];
  applyAutoBreak: boolean;
  breakDurationMinutes: number;
  breakStartTime: string | null;
  breakEndTime: string | null;
  coveringForUserId: string | null;
  coverageReason: string | null;
  notes: string | null;
}

export interface CreateAssignmentDto {
  userId: string;
  workDate: Date;
  periods: WorkPeriodDto[];
  fromTemplateId: string | null;
  notes: string | null;
}

export interface UpdateAssignmentDto {
  workDate?: Date;
  periods?: WorkPeriodDto[];
  notes?: string | null;
}

export interface ListAssignmentsFilter {
  userId?: string;
  startDate: Date;
  endDate: Date;
  status?: AssignmentStatus | 'all';
  departmentKey?: string;
  positionKey?: string;
  locationId?: string;
}

export interface TemplateCommitmentDto {
  locationId: string;
  startTime: string;
  endTime: string;
  serviceType: string | null;
  isMandatory: boolean;
  arrivalTolerance: number;
}

export interface CreateTemplateDto {
  name: string;
  description: string | null;
  shiftType: ShiftType;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultStartLocationId: string | null;
  defaultEndLocationId: string | null;
  defaultServiceCommitments: TemplateCommitmentDto[];
  applyAutoBreak: boolean;
  breakDurationMinutes: number;
  colorHex: string | null;
}

export interface UpdateTemplateDto {
  name?: string;
  description?: string | null;
  shiftType?: ShiftType;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultStartLocationId?: string | null;
  defaultEndLocationId?: string | null;
  defaultServiceCommitments?: TemplateCommitmentDto[];
  applyAutoBreak?: boolean;
  breakDurationMinutes?: number;
  colorHex?: string | null;
  isActive?: boolean;
}

export interface ListTemplatesFilter {
  isActive?: boolean;
  shiftType?: ShiftType;
}
