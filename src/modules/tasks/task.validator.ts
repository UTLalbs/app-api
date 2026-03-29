import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────

const taskTypeSchema = z.enum([
  'error_report',
  'maintenance_report',
  'invoice_issue',
  'license_expiry',
  'fuel_alert',
  'custom',
]);

const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const taskAreaSchema = z.enum([
  'development',
  'maintenance',
  'administration',
  'hr',
  'logistics',
  'fuel',
]);

const taskStatusSchema = z.enum([
  'open',
  'in_progress',
  'resolved',
  'ignored',
  'cancelled',
]);

// ── Schemas principales ────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  body: z.object({
    type:          taskTypeSchema,
    title:         z.string().min(1).max(200),
    description:   z.string().min(1),
    priority:      taskPrioritySchema,
    area:          taskAreaSchema,
    entity:        z.string().min(1),
    entityId:      z.string().min(1),
    entityName:    z.string().min(1),
    sourceId:      z.string().nullable().optional(),
    assignedTo:    z.string().length(24).nullable().optional(),
    participants:  z.array(z.string().length(24)).optional(),
    dueDate:       z.string().datetime().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const updateTaskSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    status:        taskStatusSchema.optional(),
    priority:      taskPrioritySchema.optional(),
    assignedTo:    z.string().length(24).nullable().optional(),
    participants:  z.array(z.string().length(24)).optional(),
    dueDate:       z.string().datetime().nullable().optional(),
  }),
});

export const listTasksSchema = z.object({
  query: z.object({
    status:     taskStatusSchema.optional(),
    priority:   taskPrioritySchema.optional(),
    area:       taskAreaSchema.optional(),
    type:       taskTypeSchema.optional(),
    assignedTo: z.string().length(24).optional(),
  }),
});

export const taskIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateTaskInput   = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput   = z.infer<typeof updateTaskSchema>;
export type ListTasksInput    = z.infer<typeof listTasksSchema>;