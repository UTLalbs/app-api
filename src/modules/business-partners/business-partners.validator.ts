import {z} from "zod";

import {BUSINESS_PARTNER_ROLES} from "./business-partners.types";

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

const contactSchema = z.object({
	name: z.string().min(1).max(120),
	phoneCode: z.string().min(2).max(5),
	phone: z.string().min(7).max(20),
	email: z.string().email().nullable().optional(),
	role: z.enum(["general", "operations", "billing", "other"]).default("general"),
});

const roleSchema = z.enum(
	BUSINESS_PARTNER_ROLES as unknown as [string, ...string[]],
);

const RFC_REGEX = /^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/;

// Discriminated union por taxRegime
const mexicanFiscalSchema = z.object({
	taxRegime: z.literal("mexican"),
	rfc: z
		.string()
		.min(12)
		.max(13)
		.regex(RFC_REGEX, "Formato de RFC inválido"),
	foreignTaxId: z.null().optional(),
	foreignTaxCountry: z.null().optional(),
});

const foreignFiscalSchema = z.object({
	taxRegime: z.literal("foreign"),
	rfc: z.null().optional(),
	foreignTaxId: z.string().min(3).max(40),
	foreignTaxCountry: z.string().length(2, "Código ISO 3166-1 alpha-2"),
});

const fiscalSchema = z.discriminatedUnion("taxRegime", [
	mexicanFiscalSchema,
	foreignFiscalSchema,
]);

const baseBodySchema = z.object({
	legalName: z.string().min(1).max(300),
	commercialName: z.string().max(300).nullable().optional(),
	address: addressSchema.nullable().optional(),
	contacts: z.array(contactSchema).min(1, "Al menos un contacto es requerido"),
	roles: z.array(roleSchema).default([]),
	notes: z.string().max(2000).nullable().optional(),
});

// ── Schemas ───────────────────────────────────────────────────────────────

export const createBusinessPartnerSchema = z.object({
	body: z.intersection(baseBodySchema, fiscalSchema),
});

export const updateBusinessPartnerSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z
		.intersection(
			baseBodySchema.partial(),
			fiscalSchema.optional() as unknown as typeof fiscalSchema,
		)
		.or(baseBodySchema.partial())
		.transform((v) => v),
});

// Update suelto: partial sin discriminated union (taxRegime opcional). Si viene
// taxRegime, el service revalida.
export const updateBusinessPartnerLooseSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		legalName: z.string().min(1).max(300).optional(),
		commercialName: z.string().max(300).nullable().optional(),
		taxRegime: z.enum(["mexican", "foreign"]).optional(),
		rfc: z.string().nullable().optional(),
		foreignTaxId: z.string().nullable().optional(),
		foreignTaxCountry: z.string().nullable().optional(),
		address: addressSchema.nullable().optional(),
		contacts: z.array(contactSchema).min(1).optional(),
		roles: z.array(roleSchema).optional(),
		isActive: z.boolean().optional(),
		notes: z.string().max(2000).nullable().optional(),
	}),
});

export const businessPartnerIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export const listBusinessPartnersSchema = z.object({
	query: z.object({
		role: roleSchema.optional(),
		isActive: z
			.union([z.literal("true"), z.literal("false")])
			.optional()
			.transform((v) => (v === undefined ? undefined : v === "true")),
		taxRegime: z.enum(["mexican", "foreign"]).optional(),
		search: z.string().max(200).optional(),
		page: z.coerce.number().min(1).optional(),
		limit: z.coerce.number().min(1).max(100).optional(),
	}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateBusinessPartnerInput = z.infer<typeof createBusinessPartnerSchema>;
export type UpdateBusinessPartnerInput = z.infer<typeof updateBusinessPartnerLooseSchema>;
export type ListBusinessPartnersInput = z.infer<typeof listBusinessPartnersSchema>;
