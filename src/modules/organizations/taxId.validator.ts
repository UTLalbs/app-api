import {z} from "zod";

const addressSchema = z.object({
	street: z.string().default(""),
	numExt: z.string().default(""),
	numInt: z.string().default(""),
	city: z.object({name: z.string(), code: z.string()}),
	state: z.object({name: z.string(), code: z.string()}),
	town: z.object({name: z.string(), code: z.string()}),
	suburb: z.object({name: z.string(), code: z.string()}),
	location: z.object({name: z.string(), code: z.string()}),
	country: z.object({name: z.string(), code: z.string()}),
	cp: z.string().min(4).max(10),
	reference: z.string().optional(),
});

const taxIdBaseSchema = z.object({
	rfc: z
		.string()
		.min(12)
		.max(13)
		.regex(/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/, "Formato de RFC inválido"),
	razonSocial: z.string().min(1).max(300),
	regimenFiscal: z.object({
		code: z.string().min(1),
		name: z.string().min(1),
	}),
	address: addressSchema.nullable().optional(),
});

// ── Schemas de validación ──────────────────────────────────────────────────

export const orgIdAndTaxIdParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		taxIdId: z.string().length(24),
	}),
});

export const orgIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export const createTaxIdSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: taxIdBaseSchema.extend({
		isDefault: z.boolean().optional(),
	}),
});

export const updateTaxIdSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		taxIdId: z.string().length(24),
	}),
	body: taxIdBaseSchema.partial(),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateTaxIdInput = z.infer<typeof createTaxIdSchema>;
export type UpdateTaxIdInput = z.infer<typeof updateTaxIdSchema>;
