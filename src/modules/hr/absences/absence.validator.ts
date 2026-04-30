import { z } from 'zod';

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const CATEGORY_KEY = /^[a-z][a-z0-9_]*$/;
const ABSENCE_STATUS = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'all',
] as const;

// ── Solicitudes ───────────────────────────────────────────────────────────

export const absenceIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const listAbsenceRequestsSchema = z.object({
  query: z
    .object({
      userId: z.string().length(24).optional(),
      status: z.enum(ABSENCE_STATUS).default('all'),
      categoryKey: z.string().optional(),
      departmentKey: z.string().optional(),
      positionKey: z.string().optional(),
      startDateFrom: z.coerce.date().optional(),
      startDateTo: z.coerce.date().optional(),
      requestedAtFrom: z.coerce.date().optional(),
      requestedAtTo: z.coerce.date().optional(),
      page: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
    })
    .refine(
      (d) =>
        !d.startDateFrom ||
        !d.startDateTo ||
        d.startDateTo >= d.startDateFrom,
      { message: 'startDateTo debe ser >= startDateFrom', path: ['startDateTo'] },
    ),
});

export const createAbsenceRequestSchema = z.object({
  body: z
    .object({
      userId: z.string().length(24),
      categoryKey: z.string().min(1).max(50),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      isPartialDay: z.boolean().default(false),
      partialDayHours: z.number().min(1).max(8).nullable().default(null),
      reason: z.string().max(1000).nullable().default(null),
      imssReference: z.string().max(50).nullable().default(null),
      certificateExpiresAt: z.coerce.date().nullable().default(null),
      autoApprove: z.boolean().default(false),
    })
    .refine((d) => d.endDate >= d.startDate, {
      message: 'endDate debe ser >= startDate',
      path: ['endDate'],
    }),
});

export const updateAbsenceRequestSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z
    .object({
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      reason: z.string().max(1000).nullable().optional(),
      imssReference: z.string().max(50).nullable().optional(),
      certificateExpiresAt: z.coerce.date().nullable().optional(),
    })
    .refine(
      (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
      { message: 'endDate debe ser >= startDate', path: ['endDate'] },
    ),
});

export const approveAbsenceSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    notes: z.string().max(1000).nullable().default(null),
  }),
});

const REJECTION_CATEGORIES = [
  'insufficient_notice',
  'staffing_conflict',
  'peak_season',
  'pending_workload',
  'incomplete_documentation',
  'policy_violation',
  'other',
] as const;

export const rejectAbsenceSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    rejectionCategory: z.enum(REJECTION_CATEGORIES),
    rejectionReason: z.string().min(1).max(1000),
    notes: z.string().max(1000).nullable().default(null),
  }),
});

const CANCELLATION_CATEGORIES = [
  'employee_request',
  'date_change',
  'data_error',
  'no_longer_needed',
  'medical_recovery',
  'manager_decision',
  'other',
] as const;

export const cancelAbsenceSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z
    .object({
      cancellationCategory: z.enum(CANCELLATION_CATEGORIES),
      cancellationReason: z.string().max(1000).nullable().default(null),
    })
    // Si el motivo es 'other', el texto libre es obligatorio para no perder
    // contexto sobre cancelaciones atípicas.
    .refine(
      (d) =>
        d.cancellationCategory !== 'other' ||
        (d.cancellationReason !== null && d.cancellationReason.trim().length > 0),
      {
        message: 'Cuando el motivo es "Otro" debes describirlo',
        path: ['cancellationReason'],
      },
    ),
});

export const checkConflictsSchema = z.object({
  query: z
    .object({
      userId: z.string().length(24),
      categoryKey: z.string().min(1).max(50),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
    })
    .refine((d) => d.endDate >= d.startDate, {
      message: 'endDate debe ser >= startDate',
      path: ['endDate'],
    }),
});

export const activeOnDateParamSchema = z.object({
  params: z.object({
    date: z.coerce.date(),
  }),
});

export const assignCoverageSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    assignments: z
      .array(
        z.object({
          scheduleId: z.string().length(24),
          coveringUserId: z.string().length(24).nullable(),
          status: z.enum(['unresolved', 'cancelled', 'covered_by']),
        }),
      )
      .min(1),
  }),
});

// ── Saldos ────────────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  params: z.object({ userId: z.string().length(24) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
});

export const listBalancesSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
});

// ── Categorías ────────────────────────────────────────────────────────────

export const categoryIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const createCategorySchema = z.object({
  body: z.object({
    key: z.string().min(1).max(50).regex(CATEGORY_KEY).optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullable().default(null),
    isPaid: z.boolean(),
    consumesBalance: z.boolean(),
    requiresApproval: z.boolean(),
    requiresCertificate: z.boolean(),
    maxDaysPerRequest: z.number().int().min(1).max(365).nullable().default(null),
    legalMinimumDays: z.number().int().min(0).max(365).nullable().default(null),
    hrApprovalThresholdDays: z
      .number()
      .int()
      .min(0)
      .max(365)
      .default(5),
    colorHex: z.string().regex(HEX_COLOR),
    iconEmoji: z.string().max(8).nullable().default(null),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    isPaid: z.boolean().optional(),
    consumesBalance: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    requiresCertificate: z.boolean().optional(),
    maxDaysPerRequest: z.number().int().min(1).max(365).nullable().optional(),
    legalMinimumDays: z.number().int().min(0).max(365).nullable().optional(),
    hrApprovalThresholdDays: z
      .number()
      .int()
      .min(0)
      .max(365)
      .optional(),
    colorHex: z.string().regex(HEX_COLOR).optional(),
    iconEmoji: z.string().max(8).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type ListAbsenceRequestsInput = z.infer<typeof listAbsenceRequestsSchema>;
export type CreateAbsenceRequestInput = z.infer<typeof createAbsenceRequestSchema>;
export type UpdateAbsenceRequestInput = z.infer<typeof updateAbsenceRequestSchema>;
export type ApproveAbsenceInput = z.infer<typeof approveAbsenceSchema>;
export type RejectAbsenceInput = z.infer<typeof rejectAbsenceSchema>;
export type CancelAbsenceInput = z.infer<typeof cancelAbsenceSchema>;
export type CheckConflictsInput = z.infer<typeof checkConflictsSchema>;
export type ActiveOnDateInput = z.infer<typeof activeOnDateParamSchema>;
export type AssignCoverageInput = z.infer<typeof assignCoverageSchema>;
export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type ListBalancesInput = z.infer<typeof listBalancesSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
