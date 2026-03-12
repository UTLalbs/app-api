import { z } from 'zod';

// ── Reutilizables ──────────────────────────────────────────────────────────

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

const slugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(60, 'Slug must not exceed 60 characters')
  .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens')
  .trim();

const orgStatusSchema = z.enum(['active', 'suspended', 'trial']);

const orgSettingsSchema = z.object({
  allowedEmailDomains: z
    .array(z.string().email('Each domain entry must be a valid email domain'))
    .optional(),
  maxUsers: z
    .number()
    .int('Max users must be an integer')
    .min(1, 'Max users must be at least 1')
    .max(10000, 'Max users cannot exceed 10000')
    .optional(),
});

// ── Schemas por operación ──────────────────────────────────────────────────

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z
      .string({ error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters')
      .trim(),
    slug: slugSchema.optional(),
    settings: orgSettingsSchema.optional(),
  }),
});

export const updateOrganizationSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters')
      .trim()
      .optional(),
    status: orgStatusSchema.optional(),
    settings: orgSettingsSchema.optional(),
  }),
});

export const orgIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;