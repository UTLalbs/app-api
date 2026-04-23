import { z } from 'zod';

const keySchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case (a-z, 0-9, _)');

export const listDepartmentsSchema = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    isSystem: z.enum(['true', 'false']).optional(),
  }),
});

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    key:  keySchema.optional(),
  }),
});

export const updateDepartmentSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name:     z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const departmentIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export type ListDepartmentsInput   = z.infer<typeof listDepartmentsSchema>;
export type CreateDepartmentInput  = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput  = z.infer<typeof updateDepartmentSchema>;
