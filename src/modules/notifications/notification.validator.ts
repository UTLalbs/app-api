import { z } from 'zod';

// ── Schemas principales ────────────────────────────────────────────────────

export const listNotificationsSchema = z.object({
  query: z.object({
    read:  z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export const updateNotificationReadSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    read: z.boolean(),
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type ListNotificationsInput       = z.infer<typeof listNotificationsSchema>;
export type UpdateNotificationReadInput  = z.infer<typeof updateNotificationReadSchema>;