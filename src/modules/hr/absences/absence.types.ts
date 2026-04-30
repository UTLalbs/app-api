import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type AbsenceStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type AbsenceConflictType =
  | 'schedule_overlap'
  | 'overlapping_request'
  | 'insufficient_balance'
  | 'exceeds_max_days';

export type AbsenceConflictSeverity = 'info' | 'warning' | 'critical';

export type AbsenceRequestedByRole =
  | 'self'
  | 'manager'
  | 'hr_manager'
  | 'admin';

export type CoverageStatus = 'unresolved' | 'cancelled' | 'covered_by';

// Catálogo cerrado de motivos de cancelación. Mantiene los datos
// estructurados para reportes (ej. "% de cancelaciones por error de fecha")
// vs. texto libre.
export type CancellationCategory =
  | 'employee_request'   // El empleado pidió cancelarla
  | 'date_change'        // Cambio de fechas (se hará nueva solicitud)
  | 'data_error'         // Error en los datos / fecha incorrecta
  | 'no_longer_needed'   // Ya no es necesaria
  | 'medical_recovery'   // Recuperación o regreso anticipado
  | 'manager_decision'   // Decisión administrativa del manager/HR
  | 'other';             // Otro motivo (requiere texto libre)

export const CANCELLATION_CATEGORY_VALUES: readonly CancellationCategory[] = [
  'employee_request',
  'date_change',
  'data_error',
  'no_longer_needed',
  'medical_recovery',
  'manager_decision',
  'other',
];

// Catálogo cerrado de motivos de rechazo. Decisión del manager / HR — la
// razón siempre se le muestra al empleado en la notificación.
export type RejectionCategory =
  | 'insufficient_notice'        // Aviso con muy poco tiempo
  | 'staffing_conflict'          // Conflicto de personal / cobertura imposible
  | 'peak_season'                // Temporada alta — no se otorgan
  | 'pending_workload'           // Carga de trabajo / proyecto pendiente
  | 'incomplete_documentation'   // Documentación incompleta
  | 'policy_violation'           // Excede política interna
  | 'other';                     // Otro motivo (texto obligatorio)

export const REJECTION_CATEGORY_VALUES: readonly RejectionCategory[] = [
  'insufficient_notice',
  'staffing_conflict',
  'peak_season',
  'pending_workload',
  'incomplete_documentation',
  'policy_violation',
  'other',
];

// ── Categorías ─────────────────────────────────────────────────────────────

export interface AbsenceCategoryDocument {
  _id: ObjectId;
  orgId: ObjectId;

  key: string;
  name: string;
  description: string | null;

  isPaid: boolean;
  consumesBalance: boolean;
  requiresApproval: boolean;
  requiresCertificate: boolean;

  maxDaysPerRequest: number | null;
  legalMinimumDays: number | null;
  hrApprovalThresholdDays: number;

  colorHex: string;
  iconEmoji: string | null;

  isSystem: boolean;
  isActive: boolean;

  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AbsenceCategory {
  id: string;
  orgId: string;

  key: string;
  name: string;
  description: string | null;

  isPaid: boolean;
  consumesBalance: boolean;
  requiresApproval: boolean;
  requiresCertificate: boolean;

  maxDaysPerRequest: number | null;
  legalMinimumDays: number | null;
  hrApprovalThresholdDays: number;

  colorHex: string;
  iconEmoji: string | null;

  isSystem: boolean;
  isActive: boolean;

  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Subdocumentos de la solicitud ──────────────────────────────────────────

export interface AbsenceConflictDocument {
  type: AbsenceConflictType;
  severity: AbsenceConflictSeverity;
  description: string;
  details: Record<string, unknown>;
}

export interface AbsenceConflict {
  type: AbsenceConflictType;
  severity: AbsenceConflictSeverity;
  description: string;
  details: Record<string, unknown>;
}

export interface CoverageAssignmentDocument {
  scheduleId: ObjectId;
  workDate: Date;
  status: CoverageStatus;
  coveringUserId: ObjectId | null;
  resolvedAt: Date | null;
}

export interface CoverageAssignment {
  scheduleId: string;
  workDate: string;
  status: CoverageStatus;
  coveringUserId: string | null;
  resolvedAt: Date | null;
}

export interface AbsenceAttachmentDocument {
  _id: ObjectId;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  uploadedBy: ObjectId;
  uploadedAt: Date;
  description: string | null;
}

export interface AbsenceAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  uploadedBy: string;
  uploadedAt: Date;
  description: string | null;
}

export interface AbsenceDenormalizedRefs {
  userName: string;
  userPosition: string | null;
  userManagerId: string | null;
  userManagerName: string | null;
  categoryName: string;
  categoryColorHex: string;
}

// ── Solicitud de ausencia ──────────────────────────────────────────────────

export interface AbsenceRequestDocument {
  _id: ObjectId;
  orgId: ObjectId;

  userId: ObjectId;
  categoryKey: string;

  startDate: Date;
  endDate: Date;

  totalDaysNatural: number;
  totalDaysWorking: number;
  daysConsumeFromBalance: number;

  isPartialDay: boolean;
  partialDayHours: number | null;

  status: AbsenceStatus;

  requestedBy: ObjectId;
  requestedByRole: AbsenceRequestedByRole;
  requestedAt: Date;

  reviewedBy: ObjectId | null;
  reviewedAt: Date | null;
  reviewerNotes: string | null;

  requiresHrApproval: boolean;
  hrReviewedBy: ObjectId | null;
  hrReviewedAt: Date | null;
  hrReviewerNotes: string | null;

  rejectionReason: string | null;
  rejectionCategory: RejectionCategory | null;

  cancelledBy: ObjectId | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationCategory: CancellationCategory | null;

  reason: string | null;

  attachments: AbsenceAttachmentDocument[];

  imssReference: string | null;
  certificateExpiresAt: Date | null;

  conflicts: AbsenceConflictDocument[];

  coverageAssignments: CoverageAssignmentDocument[];

  // AI-ready (placeholders)
  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: AbsenceDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AbsenceRequest {
  id: string;
  orgId: string;

  userId: string;
  categoryKey: string;

  startDate: string;     // ISO date (yyyy-mm-dd)
  endDate: string;

  totalDaysNatural: number;
  totalDaysWorking: number;
  daysConsumeFromBalance: number;

  isPartialDay: boolean;
  partialDayHours: number | null;

  status: AbsenceStatus;

  requestedBy: string;
  requestedByRole: AbsenceRequestedByRole;
  requestedAt: Date;

  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewerNotes: string | null;

  requiresHrApproval: boolean;
  hrReviewedBy: string | null;
  hrReviewedAt: Date | null;
  hrReviewerNotes: string | null;

  rejectionReason: string | null;
  rejectionCategory: RejectionCategory | null;

  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationCategory: CancellationCategory | null;

  reason: string | null;

  attachments: AbsenceAttachment[];

  imssReference: string | null;
  certificateExpiresAt: Date | null;

  conflicts: AbsenceConflict[];

  coverageAssignments: CoverageAssignment[];

  llmSummary: string | null;
  humanReadableId: string | null;
  denormalizedRefs: AbsenceDenormalizedRefs;

  createdAt: Date;
  updatedAt: Date;
}

// ── Saldo de ausencias ─────────────────────────────────────────────────────

export interface VacationBalance {
  daysEarned: number;
  daysTaken: number;
  daysPending: number;
  daysAvailable: number;
  earnedAt: Date | null;
  nextAccrualAt: Date | null;
}

export interface CustomBalance {
  categoryKey: string;
  daysEarned: number;
  daysTaken: number;
  daysPending: number;
  daysAvailable: number;
}

export interface UserAbsenceBalanceDocument {
  _id: ObjectId;
  orgId: ObjectId;
  userId: ObjectId;
  year: number;

  vacation: VacationBalance;
  customBalances: CustomBalance[];

  lastCalculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAbsenceBalance {
  id: string;
  orgId: string;
  userId: string;
  year: number;

  vacation: VacationBalance;
  customBalances: CustomBalance[];

  lastCalculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateAbsenceRequestDto {
  userId: string;
  categoryKey: string;
  startDate: Date;
  endDate: Date;
  isPartialDay: boolean;
  partialDayHours: number | null;
  reason: string | null;
  imssReference: string | null;
  certificateExpiresAt: Date | null;
  autoApprove: boolean;
}

export interface UpdateAbsenceRequestDto {
  startDate?: Date;
  endDate?: Date;
  reason?: string | null;
  imssReference?: string | null;
  certificateExpiresAt?: Date | null;
}

export interface ListAbsenceRequestsFilter {
  userId?: string;
  status?: AbsenceStatus | 'all';
  categoryKey?: string;
  departmentKey?: string;
  positionKey?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
  requestedAtFrom?: Date;
  requestedAtTo?: Date;
  page: number;
  pageSize: number;
}

export interface CheckConflictsDto {
  userId: string;
  startDate: Date;
  endDate: Date;
  categoryKey: string;
}

export interface CreateAbsenceCategoryDto {
  key?: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  consumesBalance: boolean;
  requiresApproval: boolean;
  requiresCertificate: boolean;
  maxDaysPerRequest: number | null;
  legalMinimumDays: number | null;
  hrApprovalThresholdDays: number;
  colorHex: string;
  iconEmoji: string | null;
}

export interface UpdateAbsenceCategoryDto {
  name?: string;
  description?: string | null;
  isPaid?: boolean;
  consumesBalance?: boolean;
  requiresApproval?: boolean;
  requiresCertificate?: boolean;
  maxDaysPerRequest?: number | null;
  legalMinimumDays?: number | null;
  hrApprovalThresholdDays?: number;
  colorHex?: string;
  iconEmoji?: string | null;
  isActive?: boolean;
}

export interface AssignCoverageDto {
  assignments: Array<{
    scheduleId: string;
    coveringUserId: string | null;
    status: CoverageStatus;
  }>;
}
