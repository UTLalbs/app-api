import { z } from 'zod';

const actionSchema = z.enum(['read', 'write', 'delete', 'admin']);

const permissionSchema = z.object({
  resource: z.string().min(1),
  actions: z.array(actionSchema).min(1),
});

export const createRoleSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores'),
    description: z.string().min(1).max(200),
    orgId: z.string().optional().nullable(),
    permissions: z.array(permissionSchema).min(1),
  }),
});

export const updateRoleSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores')
      .optional(),
    description: z.string().min(1).max(200).optional(),
    permissions: z.array(permissionSchema).min(1).optional(),
  }),
});

export const roleIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;