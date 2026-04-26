import {z} from "zod";

// ── Subschemas ────────────────────────────────────────────────────────────

const codeNameSchema = z.object({
	code: z.string(),
	name: z.string(),
});

const addressSchema = z.object({
	street: z.string(),
	numExt: z.string(),
	numInt: z.string(),
	city: codeNameSchema,
	state: codeNameSchema,
	town: codeNameSchema,
	suburb: codeNameSchema,
	location: codeNameSchema,
	country: codeNameSchema,
	cp: z.string(),
	reference: z.string().optional(),
});

const fiscalSchema = z.object({
	razonSocial: z.string().min(1),
	rfc: z.string().min(1).max(13).nullable(),
	taxId: z.string().nullable(),
	regimenFiscal: codeNameSchema.nullable(),
	rfcValidatedAt: z.coerce.date().nullable().optional(),
	rfcValidatedStatus: z.enum(["valid", "invalid", "pending"]).nullable().optional(),
	validationSource: z.enum(["facturoporti", "manual"]).nullable().optional(),
	validationNotes: z.string().nullable().optional(),
});

const geoPointSchema = z.object({
	type: z.literal("Point"),
	coordinates: z.tuple([z.number(), z.number()]),
});

const geofenceSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("circle"),
		center: z.object({lat: z.number(), lng: z.number()}),
		radiusMeters: z.number().positive(),
	}),
	z.object({
		type: z.literal("polygon"),
		points: z
			.array(z.object({lat: z.number(), lng: z.number()}))
			.min(3),
	}),
]);

const contactSchema = z.object({
	name: z.string().nullable(),
	role: z.string().nullable(),
	phone: z.string().nullable(),
	phoneCode: z.enum(["+52", "+1", "+other"]),
	email: z.string().email().nullable(),
	notes: z.string().nullable(),
});

const dayScheduleSchema = z.object({
	open: z.string(),
	close: z.string(),
	closed: z.boolean(),
});

const weeklyScheduleSchema = z.object({
	monday: dayScheduleSchema.nullable(),
	tuesday: dayScheduleSchema.nullable(),
	wednesday: dayScheduleSchema.nullable(),
	thursday: dayScheduleSchema.nullable(),
	friday: dayScheduleSchema.nullable(),
	saturday: dayScheduleSchema.nullable(),
	sunday: dayScheduleSchema.nullable(),
});

const operatingHoursSchema = z.object({
	is24x7: z.boolean(),
	schedule: weeklyScheduleSchema.nullable(),
	holidays: z.enum(["open", "closed", "reduced"]),
});

const accessHoursSchema = z.object({
	hasRestrictedAccess: z.boolean(),
	schedule: weeklyScheduleSchema.nullable(),
	notes: z.string().nullable(),
});

// ── Schemas de endpoints ──────────────────────────────────────────────────

export const listLocationsSchema = z.object({
	query: z.object({
		search: z.string().optional(),
		country: z.string().optional(),
		isFiscal: z.enum(["true", "false"]).optional(),
		isActive: z.enum(["true", "false"]).optional(),
		clientId: z.string().length(24).optional(),
		page: z.coerce.number().int().positive().optional(),
		limit: z.coerce.number().int().positive().max(100).optional(),
	}),
});

export const locationIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export const createLocationSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(200),
		description: z.string().max(500).nullable().optional(),

		location: geoPointSchema,
		geofence: geofenceSchema,

		isFiscal: z.boolean(),
		fiscal: fiscalSchema.nullable().optional(),
		address: addressSchema.nullable().optional(),

		clientId: z.string().length(24).nullable().optional(),
		contact: contactSchema.nullable().optional(),
		operatingHours: operatingHoursSchema.nullable().optional(),
		accessHours: accessHoursSchema.nullable().optional(),
	}),
});

export const updateLocationSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(1).max(200).optional(),
		description: z.string().max(500).nullable().optional(),

		location: geoPointSchema.optional(),
		geofence: geofenceSchema.optional(),

		isFiscal: z.boolean().optional(),
		fiscal: fiscalSchema.nullable().optional(),
		address: addressSchema.nullable().optional(),

		clientId: z.string().length(24).nullable().optional(),
		contact: contactSchema.nullable().optional(),
		operatingHours: operatingHoursSchema.nullable().optional(),
		accessHours: accessHoursSchema.nullable().optional(),

		isActive: z.boolean().optional(),
	}),
});

export const nearbyLocationsSchema = z.object({
	query: z.object({
		lat: z.coerce.number(),
		lng: z.coerce.number(),
		radiusMeters: z.coerce.number().positive(),
		limit: z.coerce.number().int().positive().max(100).optional(),
	}),
});

export const autocompleteLocationsSchema = z.object({
	query: z.object({
		q: z.string().min(1),
	}),
});

export const idOrigenDestinoParamSchema = z.object({
	params: z.object({id: z.string().min(1)}),
});

export const validateFiscalSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		rfc: z.string().min(1).max(13),
		razonSocial: z.string().min(1),
		cp: z.string().min(4).max(5),
	}),
});

export const checkPointSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		lat: z.number(),
		lng: z.number(),
	}),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type ListLocationsInput = z.infer<typeof listLocationsSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type NearbyLocationsInput = z.infer<typeof nearbyLocationsSchema>;
export type AutocompleteLocationsInput = z.infer<typeof autocompleteLocationsSchema>;
export type ValidateFiscalInput = z.infer<typeof validateFiscalSchema>;
export type CheckPointInput = z.infer<typeof checkPointSchema>;
