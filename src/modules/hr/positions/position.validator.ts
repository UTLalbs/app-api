import { z } from 'zod';

// `key` snake_case: minúsculas, dígitos y underscores. Opcional en create — el
// service lo deriva del name si no viene.
const keySchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case (a-z, 0-9, _)');

export const listPositionsSchema = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    isSystem: z.enum(['true', 'false']).optional(),
  }),
});

export const createPositionSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    key:  keySchema.optional(),
  }),
});

export const updatePositionSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name:     z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const positionIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export type ListPositionsInput   = z.infer<typeof listPositionsSchema>;
export type CreatePositionInput  = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput  = z.infer<typeof updatePositionSchema>;
