import { z } from 'zod';

const EVENT_TYPES = [
  'shift_start',
  'shift_end',
  'location_arrival',
  'location_departure',
  'break_start',
  'break_end',
  'meal_start',
  'meal_end',
] as const;

const RESOLUTION_TYPES = [
  'absence_justified',
  'absence_unjustified',
  'manual_correction',
  'accepted_as_reported',
  'incident_raised',
  'tardiness_justified',
  'event_excluded',
] as const;

const REVIEW_STATUSES = [
  'auto_ok',
  'pending',
  'resolved_ok',
  'resolved_action',
  'all',
] as const;

const SHIFT_PERIODS = ['morning', 'afternoon', 'night', 'full_day'] as const;

const TABS = [
  'missing_clockin',
  'late_arrivals',
  'anomalies',
  'in_progress',
  'closed',
  'absences',
  'all',
] as const;

const reportedLocationSchema = z
  .object({
    coordinates: z.tuple([z.number(), z.number()]).nullable(),
    accuracyMeters: z.number().min(0).nullable(),
    capturedAt: z.coerce.date(),
  })
  .nullable();

// ── Eventos ────────────────────────────────────────────────────────────────

export const eventIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const createEventSchema = z.object({
  body: z.object({
    // userId opcional — si no viene, el controller lo deduce del usuario
    // autenticado (caso típico "fichar para mí mismo").
    userId: z.string().length(24).optional(),
    type: z.enum(EVENT_TYPES),
    clockedAt: z.coerce.date().nullable().default(null),
    scheduleId: z.string().length(24).nullable().default(null),
    periodId: z.string().length(24).nullable().default(null),
    serviceCommitmentId: z.string().length(24).nullable().default(null),
    reportedLocation: reportedLocationSchema.default(null),
    notes: z.string().max(500).nullable().default(null),
  }),
});

export const createManualEventSchema = z.object({
  body: z.object({
    userId: z.string().length(24),
    type: z.enum(EVENT_TYPES),
    clockedAt: z.coerce.date(),
    expectedLocationId: z.string().length(24),
    correctionReason: z.string().min(1).max(500),
    correctsEventId: z.string().length(24).nullable().default(null),
    notes: z.string().max(1000).nullable().default(null),
  }),
});

export const excludeEventSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    exclusionReason: z.string().min(1).max(500),
  }),
});

export const listEventsSchema = z.object({
  query: z
    .object({
      userId: z.string().length(24).optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      type: z.enum(EVENT_TYPES).optional(),
      reviewStatus: z.enum(REVIEW_STATUSES).default('all'),
      page: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
    })
    .refine((d) => d.endDate >= d.startDate, {
      message: 'endDate debe ser >= startDate',
      path: ['endDate'],
    }),
});

// ── Days ──────────────────────────────────────────────────────────────────

export const dayIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const listDaysSchema = z.object({
  // shiftDate (single) sigue funcionando para la página de revisión por
  // turno; shiftDateFrom/shiftDateTo permiten consultas por rango (historial
  // por empleado). userId filtra a un empleado específico.
  query: z
    .object({
      shiftDate: z.coerce.date().optional(),
      shiftDateFrom: z.coerce.date().optional(),
      shiftDateTo: z.coerce.date().optional(),
      shiftPeriod: z.enum(SHIFT_PERIODS).default('full_day'),
      tab: z.enum(TABS).default('all'),
      userId: z.string().length(24).optional(),
      departmentKey: z.string().optional(),
      positionKey: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
    })
    .refine(
      (d) => d.shiftDate || (d.shiftDateFrom && d.shiftDateTo),
      {
        message: 'Pasa shiftDate o (shiftDateFrom + shiftDateTo)',
        path: ['shiftDate'],
      },
    )
    .refine(
      (d) =>
        !d.shiftDateFrom || !d.shiftDateTo || d.shiftDateTo >= d.shiftDateFrom,
      { message: 'shiftDateTo debe ser >= shiftDateFrom', path: ['shiftDateTo'] },
    ),
});

export const resolveAnomalySchema = z.object({
  params: z.object({
    id: z.string().length(24),
    anomalyId: z.string().length(24),
  }),
  body: z.object({
    resolutionType: z.enum(RESOLUTION_TYPES),
    resolutionNotes: z.string().max(1000).nullable().default(null),
    correctedClockedAt: z.coerce.date().nullable().default(null),
    correctedLocationId: z.string().length(24).nullable().default(null),
  }),
});

// ── Sesiones de revisión ──────────────────────────────────────────────────

export const closeSessionSchema = z.object({
  body: z.object({
    shiftDate: z.coerce.date(),
    shiftPeriod: z.enum(SHIFT_PERIODS),
    notes: z.string().max(2000).nullable().default(null),
  }),
});

export const sessionIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export const currentSessionSchema = z.object({
  query: z.object({
    shiftDate: z.coerce.date(),
    shiftPeriod: z.enum(SHIFT_PERIODS).default('full_day'),
  }),
});

export const listSessionsSchema = z.object({
  query: z
    .object({
      shiftDateFrom: z.coerce.date().optional(),
      shiftDateTo: z.coerce.date().optional(),
      reviewedBy: z.string().length(24).optional(),
      page: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
    })
    .refine(
      (d) => !d.shiftDateFrom || !d.shiftDateTo || d.shiftDateTo >= d.shiftDateFrom,
      { message: 'shiftDateTo debe ser >= shiftDateFrom', path: ['shiftDateTo'] },
    ),
});

// ── Helpers ───────────────────────────────────────────────────────────────

export const pendingByTabSchema = z.object({
  query: z.object({
    shiftDate: z.coerce.date(),
    shiftPeriod: z.enum(SHIFT_PERIODS).default('full_day'),
  }),
});

export const activeEmployeesSchema = z.object({
  query: z.object({
    departmentKey: z.string().optional(),
    positionKey: z.string().optional(),
  }),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateManualEventInput = z.infer<typeof createManualEventSchema>;
export type ExcludeEventInput = z.infer<typeof excludeEventSchema>;
export type ListEventsInput = z.infer<typeof listEventsSchema>;
export type ListDaysInput = z.infer<typeof listDaysSchema>;
export type ResolveAnomalyInput = z.infer<typeof resolveAnomalySchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type CurrentSessionInput = z.infer<typeof currentSessionSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type PendingByTabInput = z.infer<typeof pendingByTabSchema>;
export type ActiveEmployeesInput = z.infer<typeof activeEmployeesSchema>;
