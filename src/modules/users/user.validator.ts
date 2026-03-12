import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

const userStatusSchema = z.enum(['active', 'disabled', 'pending']);

export const createUserSchema = z.object({
  body: z.object({
    email: z
      .string({ error: 'Email is required' })
      .email('Invalid email format')
      .toLowerCase(),
    displayName: z
      .string({ error: 'Display name is required' })
      .min(2, 'Display name must be at least 2 characters')
      .max(100, 'Display name must not exceed 100 characters')
      .trim(),
    roles: z
      .array(objectIdSchema)
      .optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    displayName: z
      .string()
      .min(2, 'Display name must be at least 2 characters')
      .max(100, 'Display name must not exceed 100 characters')
      .trim()
      .optional(),
    roles: z
      .array(objectIdSchema)
      .optional(),
  }),
});

export const changeStatusSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    status: userStatusSchema,
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const listUsersSchema = z.object({
  query: z.object({
    status: userStatusSchema.optional(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;