import { z } from 'zod';

// Categorías y acciones — los enumeramos en `audit.types.ts`; aquí se aceptan
// strings arbitrarios y el controller los tipa. Mantenemos la validación laxa
// para que el dashboard pueda filtrar por cualquier combinación sin que Zod
// se quede desactualizado al agregar nuevas acciones.

const coercedDate = z.coerce.date().optional();

export const listAuditEventsSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    action: z.string().optional(),
    actorId: z.string().optional(),
    targetId: z.string().optional(),
    targetType: z.string().optional(),
    orgId: z.string().optional(),
    from: coercedDate,
    to: coercedDate,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

export const auditIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid audit event id'),
  }),
});

export const actorActivitySchema = z.object({
  params: z.object({
    actorId: z.string().min(1),
  }),
  query: z.object({
    from: coercedDate,
    to: coercedDate,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

export const topActorsSchema = z.object({
  query: z.object({
    from: coercedDate,
    to: coercedDate,
    category: z.string().optional(),
    orgId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
});

export const timelineSchema = z.object({
  query: z.object({
    from: coercedDate,
    to: coercedDate,
    category: z.string().optional(),
    action: z.string().optional(),
    orgId: z.string().optional(),
    granularity: z.enum(['hour', 'day']).default('day'),
  }),
});

export const targetActivitySchema = z.object({
  query: z.object({
    targetId: z.string().min(1),
    targetType: z.string().optional(),
    from: coercedDate,
    to: coercedDate,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});
