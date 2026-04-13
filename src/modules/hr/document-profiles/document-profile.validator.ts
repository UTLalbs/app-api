import {z} from "zod";

export const createDocumentProfileSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(100),
		description: z.string().max(500).nullable().optional(),
		documentTypes: z.array(z.string().min(1)).min(1),
	}),
});

export const updateDocumentProfileSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(1).max(100).optional(),
		description: z.string().max(500).nullable().optional(),
		documentTypes: z.array(z.string().min(1)).optional(),
	}),
});

export const profileIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export type CreateDocumentProfileInput = z.infer<
	typeof createDocumentProfileSchema
>;
export type UpdateDocumentProfileInput = z.infer<
	typeof updateDocumentProfileSchema
>;
