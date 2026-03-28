import { z } from 'zod';

// ── Subdocumentos ──────────────────────────────────────────────────────────

const errorReportItemSchema = z.object({
  id:          z.string().min(1),
  code:        z.string().min(1),
  category:    z.string().min(1),
  severity:    z.enum(['critical', 'error', 'warning', 'info']),
  owner:       z.string().min(1),
  title:       z.string().min(1),
  message:     z.string().min(1),
  technical:   z.string().optional(),
  entity:      z.string().optional(),
  entityId:    z.string().optional(),
  field:       z.string().optional(),
  reportable:  z.boolean(),
  timestamp:   z.string().datetime(),
});

// ── Schemas principales ────────────────────────────────────────────────────

export const createErrorReportSchema = z.object({
  body: z.object({
    id:          z.string().min(1),
    timestamp:   z.string().datetime(),
    reportedBy:  z.string().min(1),
    environment: z.enum(['development', 'production']),
    entity:      z.string().min(1),
    entityId:    z.string().min(1),
    entityName:  z.string().min(1),
    errors:      z.array(errorReportItemSchema).min(1),
    userAgent:   z.string().min(1),
    url:         z.string().min(1),
  }),
});

export const listErrorReportsSchema = z.object({
  query: z.object({
    status:      z.enum(['pending', 'resolved', 'ignored']).optional(),
    environment: z.enum(['development', 'production']).optional(),
    page:        z.coerce.number().min(1).default(1),
    limit:       z.coerce.number().min(1).max(100).default(50),
  }),
});

export const updateErrorReportStatusSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    status: z.enum(['resolved', 'ignored']),
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateErrorReportInput         = z.infer<typeof createErrorReportSchema>;
export type ListErrorReportsInput          = z.infer<typeof listErrorReportsSchema>;
export type UpdateErrorReportStatusInput   = z.infer<typeof updateErrorReportStatusSchema>;