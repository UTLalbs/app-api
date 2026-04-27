import { z } from 'zod';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

const SHIFT_TYPES = [
  'regular',
  'mixed',
  'inhouse',
  'multi_day',
  'coverage',
  'training',
] as const;

// ── Subschemas ────────────────────────────────────────────────────────────

const serviceCommitmentSchema = z.object({
  locationId: z.string().length(24),
  startTime: z.string().regex(TIME_HHMM, 'Formato esperado HH:MM'),
  endTime: z.string().regex(TIME_HHMM, 'Formato esperado HH:MM'),
  serviceType: z.string().max(100).nullable(),
  clientReference: z.string().max(100).nullable(),
  isMandatory: z.boolean(),
  arrivalTolerance: z.number().int().min(0).max(60),
  notes: z.string().max(500).nullable(),
});

const workPeriodSchema = z.object({
  shiftType: z.enum(SHIFT_TYPES),
  startTime: z.string().regex(TIME_HHMM, 'Formato esperado HH:MM'),
  endTime: z.string().regex(TIME_HHMM, 'Formato esperado HH:MM'),
  multiDay: z.boolean(),
  endDayOffset: z.number().int().min(0).max(7),
  expectedDurationDays: z.number().int().min(1).max(7).nullable(),
  startLocationId: z.string().length(24),
  endLocationId: z.string().length(24),
  serviceCommitments: z.array(serviceCommitmentSchema),
  applyAutoBreak: z.boolean(),
  breakDurationMinutes: z.number().int().min(0).max(120),
  coveringForUserId: z.string().length(24).nullable(),
  coverageReason: z.string().max(500).nullable(),
  notes: z.string().max(500).nullable(),
});

const templateCommitmentSchema = z.object({
  locationId: z.string().length(24),
  startTime: z.string().regex(TIME_HHMM),
  endTime: z.string().regex(TIME_HHMM),
  serviceType: z.string().max(100).nullable(),
  isMandatory: z.boolean(),
  arrivalTolerance: z.number().int().min(0).max(60),
});

// ── Templates ─────────────────────────────────────────────────────────────

export const listTemplatesSchema = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    shiftType: z.enum(SHIFT_TYPES).optional(),
  }),
});

export const templateIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(150),
    description: z.string().max(500).nullable(),
    shiftType: z.enum(SHIFT_TYPES),
    defaultStartTime: z.string().regex(TIME_HHMM),
    defaultEndTime: z.string().regex(TIME_HHMM),
    defaultStartLocationId: z.string().length(24).nullable(),
    defaultEndLocationId: z.string().length(24).nullable(),
    defaultServiceCommitments: z.array(templateCommitmentSchema),
    applyAutoBreak: z.boolean(),
    breakDurationMinutes: z.number().int().min(0).max(120),
    colorHex: z.string().regex(HEX_COLOR).nullable(),
  }),
});

export const updateTemplateSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(500).nullable().optional(),
    shiftType: z.enum(SHIFT_TYPES).optional(),
    defaultStartTime: z.string().regex(TIME_HHMM).optional(),
    defaultEndTime: z.string().regex(TIME_HHMM).optional(),
    defaultStartLocationId: z.string().length(24).nullable().optional(),
    defaultEndLocationId: z.string().length(24).nullable().optional(),
    defaultServiceCommitments: z.array(templateCommitmentSchema).optional(),
    applyAutoBreak: z.boolean().optional(),
    breakDurationMinutes: z.number().int().min(0).max(120).optional(),
    colorHex: z.string().regex(HEX_COLOR).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Assignments ───────────────────────────────────────────────────────────

export const listAssignmentsSchema = z.object({
  query: z
    .object({
      userId: z.string().length(24).optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      status: z.enum(['draft', 'published', 'all']).optional(),
      departmentKey: z.string().optional(),
      positionKey: z.string().optional(),
      locationId: z.string().length(24).optional(),
    })
    .refine((d) => d.endDate >= d.startDate, {
      message: 'endDate debe ser >= startDate',
      path: ['endDate'],
    }),
});

export const assignmentIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const createAssignmentSchema = z.object({
  body: z.object({
    userId: z.string().length(24),
    workDate: z.coerce.date(),
    periods: z.array(workPeriodSchema).min(1),
    fromTemplateId: z.string().length(24).nullable(),
    notes: z.string().max(1000).nullable(),
  }),
});

export const updateAssignmentSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    workDate: z.coerce.date().optional(),
    periods: z.array(workPeriodSchema).min(1).optional(),
    notes: z.string().max(1000).nullable().optional(),
  }),
});

export const listConflictsSchema = z.object({
  query: z
    .object({
      userId: z.string().length(24).optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
    })
    .refine((d) => d.endDate >= d.startDate, {
      message: 'endDate debe ser >= startDate',
      path: ['endDate'],
    }),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export type ListAssignmentsInput = z.infer<typeof listAssignmentsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ListConflictsInput = z.infer<typeof listConflictsSchema>;
