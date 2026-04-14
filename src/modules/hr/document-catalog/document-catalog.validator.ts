import {z} from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────

const categorySchema = z.enum([
	"identification",
	"hiring",
	"fiscal",
	"medical",
	"license",
	"banking",
	"usa_ops",
	"other",
]);

// ── Schemas principales ────────────────────────────────────────────────────

export const listDocumentCatalogSchema = z.object({
	query: z.object({
		category: categorySchema.optional(),
		isActive: z.enum(["true", "false"]).optional(),
	}),
});

export const createDocumentCatalogSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(100),
		category: categorySchema,
		required: z.boolean().default(false),
		hasExpiry: z.boolean().default(false),
		hasRenewal: z.boolean().default(false),
	}),
});

export const updateDocumentCatalogSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(1).max(100).optional(),
		category: categorySchema.optional(),
		required: z.boolean().optional(),
		hasExpiry: z.boolean().optional(),
		hasRenewal: z.boolean().optional(),
		isActive: z.boolean().optional(),
	}),
});

export const catalogIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
} );


export const deleteDocumentCatalogSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  query:  z.object({
    force: z.enum(['true', 'false']).optional(),
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type ListDocumentCatalogInput = z.infer<
	typeof listDocumentCatalogSchema
>;
export type CreateDocumentCatalogInput = z.infer<
	typeof createDocumentCatalogSchema
>;
export type UpdateDocumentCatalogInput = z.infer<
	typeof updateDocumentCatalogSchema
>;

export type DeleteDocumentCatalogInput = z.infer<typeof deleteDocumentCatalogSchema>;
