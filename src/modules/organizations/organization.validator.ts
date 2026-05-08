import {z} from "zod";

// ── Subdocumentos ──────────────────────────────────────────────────────────

const featuresSchema = z.object({
	operations: z.boolean().default(true),
	fuel: z.boolean().default(false),
	maintenance: z.boolean().default(false),
	administration: z.boolean().default(false),
	humanResources: z.boolean().default(false),
	payroll: z.boolean().default(false),
	catalogs: z.boolean().default(false),
});

const settingsSchema = z.object({
	timezone: z.string().default("America/Mexico_City"),
	distanceUnit: z.enum(["km", "mi"]).default("km"),
	weightUnit: z.enum(["kg", "lb"]).default("kg"),
	dimensionUnit: z.enum(["m", "ft"]).default("m"),
	volumeUnit: z.enum(["m3", "ft3"]).default("m3"),
	temperatureUnit: z.enum(["C", "F"]).default("C"),
	currency: z.array(z.string()).default(["MXN"]),
	gpsUpdateInterval: z.coerce.number().min(5).max(300).default(30),
	maxUsers: z.coerce.number().min(1).default(10),
	allowedEmailDomains: z.array(z.string()).default([]),
	features: featuresSchema.default({
		operations: true,
		fuel: false,
		maintenance: false,
		administration: false,
		humanResources: false,
		payroll: false,
		catalogs: false,
	}),
});

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

/**
 * Primer taxId enviado en el alta de organización. El resto de RFCs se agregan
 * vía POST /organizations/:id/tax-ids.
 */
const initialTaxIdSchema = z.object({
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

const contactSchema = z.object({
	name: z.string().min(1).max(100),
	title: z.string().min(1).max(100),
	phoneCode: z.enum(["+52", "+1"]).default("+52"),
	phone: z
		.string()
		.regex(/^\d{10}$/, "El teléfono debe tener 10 dígitos numéricos")
		.optional()
		.or(z.literal("")),
	email: z.string().email("Formato de email inválido"),
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

		status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
		initialTaxId: initialTaxIdSchema.optional().nullable(),
		contacts: z.array(contactSchema).optional().default([]),
	}),
});

export const updateOrganizationSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(2).max(100).optional(),
		status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
		settings: settingsSchema.partial().optional(),
		contact: contactSchema.optional().nullable(),
	}),
});

export const orgIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
