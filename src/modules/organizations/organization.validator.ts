import {z} from "zod";

// ── Subdocumentos ──────────────────────────────────────────────────────────

const featuresSchema = z.object({
	gps: z.boolean().default(false),
	invoicing: z.boolean().default(false),
	cartaPorte: z.boolean().default(false),
	fuelControl: z.boolean().default(false),
	payroll: z.boolean().default(false),
	vectorSearch: z.boolean().default(false),
});

const settingsSchema = z.object({
	timezone: z.string().default("America/Mexico_City"),
	distanceUnit: z.enum(["km", "mi"]).default("km"),
	currency: z.array(z.string()).default(["MXN"]),
	gpsUpdateInterval: z.coerce.number().min(5).max(300).default(30),
	maxUsers: z.coerce.number().min(1).default(10),
	allowedEmailDomains: z.array(z.string()).default([]),
	features: featuresSchema.default({
		gps: false,
		invoicing: false,
		cartaPorte: false,
		fuelControl: false,
		payroll: false,
		vectorSearch: false,
	}),
});

const fiscalDataSchema = z.object({
	rfc: z.string().min(12).max(13),
	razonSocial: z.string().min(1),
	regimenFiscal: z.object({
		code: z.string().min(1),
		name: z.string().min(1),
	}),
});

// ── Schemas de validación ──────────────────────────────────────────────────

export const createOrganizationSchema = z.object({
	body: z.object({
		name: z.string().min(2).max(100),
		slug: z
			.string()
			.min(2)
			.max(100)
			.regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
			.optional(),
		settings: settingsSchema.partial().optional(),
		fiscalData: fiscalDataSchema.optional().nullable(),
	}),
});

export const updateOrganizationSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(2).max(100).optional(),
		status: z.enum(["active", "suspended", "cancelled"]).optional(),
		settings: settingsSchema.partial().optional(),
		fiscalData: fiscalDataSchema.optional().nullable(),
	}),
});

export const orgIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
