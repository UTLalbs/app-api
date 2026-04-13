import { z } from 'zod';

// ── Subdocumento ───────────────────────────────────────────────────────────

const documentTypeEntrySchema = z.union([
  // Formato nuevo: { type, required }
  z.object({
    type:     z.string().min(1),
    required: z.boolean(),
  }),
  // Retrocompatibilidad: string → convertir a { type, required: true }
  z.string().min(1).transform((type) => ({ type, required: true })),
]);

// ── Schemas principales ────────────────────────────────────────────────────

export const createDocumentProfileSchema = z.object({
  body: z.object({
    name:          z.string().min(1).max(100),
    description:   z.string().max(500).nullable().optional(),
    documentTypes: z.array(documentTypeEntrySchema).min(1),
  }),
});

export const updateDocumentProfileSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name:          z.string().min(1).max(100).optional(),
    description:   z.string().max(500).nullable().optional(),
    documentTypes: z.array(documentTypeEntrySchema).optional(),
  }),
});

export const profileIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateDocumentProfileInput = z.infer<typeof createDocumentProfileSchema>;
export type UpdateDocumentProfileInput = z.infer<typeof updateDocumentProfileSchema>;