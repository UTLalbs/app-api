import {z} from "zod";

import {US_STATE_CODES} from "../../shared/constants/usStates.constants";

// ── Enums ──────────────────────────────────────────────────────────────────

const trailerStatusSchema = z.enum([
	"available",
	"in_maintenance",
	"out_of_service",
	"in_transit",
	"decommissioned",
	"returned_to_partner",
]);

const ownershipTypeSchema = z.enum([
	"owned",
	"leased_fixed_term",
	"leased_open_ended",
	"commodatum",
	"exchange",
]);

const suspensionTypeSchema = z.enum(["air", "mechanical_leaf", "rigid", "hydraulic"]);
const brakeFrictionTypeSchema = z.enum(["drum", "disc"]);
const brakeActuationTypeSchema = z.enum(["air", "hydraulic", "inertia"]);
const slackAdjusterTypeSchema = z.enum(["manual", "automatic"]);
const axleConfigSchema = z.enum(["single", "tandem", "tridem", "quad"]);
const kingpinDiameterSchema = z.enum(["2", "3.5"]);
const voltageSystemSchema = z.enum(["12V", "24V"]);
const wallMaterialSchema = z.enum([
	"post_and_panel_aluminum",
	"composite_plate",
	"plywood_frp",
	"smooth_aluminum",
	"steel",
	"other",
]);
const floorMaterialSchema = z.enum([
	"laminated_hardwood",
	"smooth_aluminum",
	"corrugated_aluminum",
	"steel",
	"frp_plywood",
	"other",
]);
const rearDoorTypeSchema = z.enum(["roll_up", "swing_double", "swing_single", "no_door"]);

// ── Helpers ────────────────────────────────────────────────────────────────

const ALPHANUM = /^[A-Z0-9]+$/;

const platesSchema = z
	.object({
		mx: z
			.string()
			.regex(/^[A-Z0-9]{6,7}$/, "Placa MX debe ser 6-7 alfanuméricos en mayúsculas")
			.nullable()
			.optional(),
		us: z
			.string()
			.regex(/^[A-Z0-9]{1,8}$/, "Placa US debe ser 1-8 alfanuméricos en mayúsculas")
			.nullable()
			.optional(),
		usState: z
			.string()
			.length(2)
			.refine((c) => US_STATE_CODES.has(c.toUpperCase()), "Estado US inválido")
			.nullable()
			.optional(),
	})
	.refine(
		// V5: al menos una placa
		(p) => Boolean(p.mx) || Boolean(p.us),
		{message: "Al menos una placa (MX o US) es requerida"},
	)
	.refine(
		// usState requerido si hay placa US
		(p) => !p.us || Boolean(p.usState),
		{message: "El estado US es requerido cuando se captura placa US", path: ["usState"]},
	);

const contractSchema = z.object({
	contractNumber: z.string().nullable().optional(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().nullable().optional(),
	terminationNotice: z.number().int().min(0).nullable().optional(),
	rentAmount: z.number().min(0).nullable().optional(),
	rentCurrency: z.enum(["MXN", "USD"]).nullable().optional(),
	rentFrequency: z.enum(["weekly", "monthly", "one_time"]).nullable().optional(),
	exchangeReference: z.string().nullable().optional(),
	expectedReturnDate: z.coerce.date().nullable().optional(),
	contractDocumentUrl: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
});

const ownershipSchema = z
	.object({
		type: ownershipTypeSchema,
		internalTaxIdId: z.string().length(24).nullable().optional(),
		businessPartnerId: z.string().length(24).nullable().optional(),
		contract: contractSchema.nullable().optional(),
	})
	.superRefine((own, ctx) => {
		// V10: owned → internalTaxIdId requerido
		if (own.type === "owned" && !own.internalTaxIdId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "internalTaxIdId es requerido cuando ownership.type='owned'",
				path: ["internalTaxIdId"],
			});
		}
		// V11: NO owned → businessPartnerId requerido
		if (own.type !== "owned" && !own.businessPartnerId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "businessPartnerId es requerido cuando ownership.type≠'owned'",
				path: ["businessPartnerId"],
			});
		}
		// V14: leased_fixed_term → contract.endDate requerido
		if (own.type === "leased_fixed_term" && !own.contract?.endDate) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "contract.endDate es requerido en arrendamientos a plazo fijo",
				path: ["contract", "endDate"],
			});
		}
		// V15: endDate > startDate cuando endDate no es null
		if (
			own.contract?.endDate &&
			own.contract?.startDate &&
			own.contract.endDate <= own.contract.startDate
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "contract.endDate debe ser mayor a startDate",
				path: ["contract", "endDate"],
			});
		}
	});

// VIN: 17 chars, sin I/O/Q. Validación de dígito verificador queda al helper
// vin-validator.ts (se aplicará en Sprint 1.6 al endpoint decode-vin); aquí
// validamos formato básico.
const vinSchema = z
	.string()
	.length(17, "VIN debe tener 17 caracteres")
	.regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN no debe contener I, O ni Q");

const currentYear = new Date().getUTCFullYear();
const modelYearSchema = z
	.number()
	.int()
	.min(1980, "modelYear debe ser >= 1980")
	.max(currentYear + 1, `modelYear debe ser <= ${currentYear + 1}`);

// ── Schemas principales ────────────────────────────────────────────────────

const baseTechSpecsShape = {
	pbvdKg: z.number().positive(),
	taraKg: z.number().positive(),
	lengthMeters: z.number().positive(),
	widthMeters: z.number().positive(),
	heightMeters: z.number().positive(),
	axleCount: z.number().int().min(1).max(8),
	axleConfiguration: axleConfigSchema,
	hasLiftAxle: z.boolean(),
	tirePositionCount: z.number().int().min(2).max(64),

	suspensionType: suspensionTypeSchema.nullable().optional(),
	suspensionBrand: z.string().nullable().optional(),
	brakeFrictionType: brakeFrictionTypeSchema.nullable().optional(),
	brakeActuationType: brakeActuationTypeSchema.nullable().optional(),
	hasABS: z.boolean().nullable().optional(),
	slackAdjusterType: slackAdjusterTypeSchema.nullable().optional(),

	kingpinDiameterInches: kingpinDiameterSchema.nullable().optional(),
	hasLandingGear: z.boolean().nullable().optional(),

	voltageSystem: voltageSystemSchema.nullable().optional(),
	hasAuxiliaryPowerUnit: z.boolean().nullable().optional(),

	wallMaterial: wallMaterialSchema.nullable().optional(),
	floorMaterial: floorMaterialSchema.nullable().optional(),
	rearDoorType: rearDoorTypeSchema.nullable().optional(),
	hasSideDoor: z.boolean().nullable().optional(),
	interiorHeightMeters: z.number().positive().nullable().optional(),
};

const createTrailerBodySchema = z
	.object({
		// Bloque A
		vin: vinSchema,
		plates: platesSchema,
		ctrSubtype: z.string().regex(/^CTR\d{3}$/i),
		economicNumber: z
			.string()
			.regex(ALPHANUM, "Solo letras y números")
			.max(40)
			.nullable()
			.optional(),

		// Bloque B
		make: z.string().min(1).max(120),
		makeCode: z.string().nullable().optional(),
		model: z.string().nullable().optional(),
		modelYear: modelYearSchema,
		manufacturer: z.string().nullable().optional(),
		nhtsaDecodedAt: z.coerce.date().nullable().optional(),
		nhtsaDecodeStatus: z
			.enum(["success", "partial", "failed", "not_attempted"])
			.nullable()
			.optional(),
		nhtsaRawData: z.record(z.string(), z.unknown()).nullable().optional(),

		// Bloque C
		...baseTechSpecsShape,

		// Bloque D
		ownership: ownershipSchema,
	})
	.superRefine((data, ctx) => {
		// V9: pbvdKg > taraKg > 0
		if (data.taraKg <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "taraKg debe ser > 0",
				path: ["taraKg"],
			});
		}
		if (data.pbvdKg <= data.taraKg) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "pbvdKg debe ser mayor a taraKg",
				path: ["pbvdKg"],
			});
		}
	});

export const createTrailerSchema = z.object({
	body: createTrailerBodySchema,
});

// Quick register: campos mínimos. type forzado a 'exchange' en service.
const quickRegisterBodySchema = z
	.object({
		vin: vinSchema.nullable().optional(),
		plates: platesSchema,
		ctrSubtype: z.string().regex(/^CTR\d{3}$/i),
		economicNumber: z
			.string()
			.regex(ALPHANUM)
			.max(40)
			.nullable()
			.optional(),
		make: z.string().max(120).nullable().optional(),
		makeCode: z.string().nullable().optional(),
		ownership: z.object({
			type: z.literal("exchange"),
			businessPartnerId: z.string().length(24),
			contract: z
				.object({
					startDate: z.coerce.date().optional(),
					expectedReturnDate: z.coerce.date().nullable().optional(),
					exchangeReference: z.string().nullable().optional(),
					notes: z.string().nullable().optional(),
				})
				.nullable()
				.optional(),
		}),
	});

export const quickRegisterTrailerSchema = z.object({
	body: quickRegisterBodySchema,
});

// Update: partial; vin no se modifica (regla de negocio — VIN es identidad
// inmutable; si se equivocaron, soft-delete + crear nuevo)
const updateTrailerBodySchema = z
	.object({
		plates: platesSchema.optional(),
		ctrSubtype: z.string().regex(/^CTR\d{3}$/i).optional(),
		economicNumber: z
			.string()
			.regex(ALPHANUM)
			.max(40)
			.nullable()
			.optional(),

		make: z.string().min(1).max(120).optional(),
		makeCode: z.string().nullable().optional(),
		model: z.string().nullable().optional(),
		modelYear: modelYearSchema.optional(),
		manufacturer: z.string().nullable().optional(),

		pbvdKg: z.number().positive().optional(),
		taraKg: z.number().positive().optional(),
		lengthMeters: z.number().positive().optional(),
		widthMeters: z.number().positive().optional(),
		heightMeters: z.number().positive().optional(),
		axleCount: z.number().int().min(1).max(8).optional(),
		axleConfiguration: axleConfigSchema.optional(),
		hasLiftAxle: z.boolean().optional(),
		tirePositionCount: z.number().int().min(2).max(64).optional(),

		suspensionType: suspensionTypeSchema.nullable().optional(),
		suspensionBrand: z.string().nullable().optional(),
		brakeFrictionType: brakeFrictionTypeSchema.nullable().optional(),
		brakeActuationType: brakeActuationTypeSchema.nullable().optional(),
		hasABS: z.boolean().nullable().optional(),
		slackAdjusterType: slackAdjusterTypeSchema.nullable().optional(),

		kingpinDiameterInches: kingpinDiameterSchema.nullable().optional(),
		hasLandingGear: z.boolean().nullable().optional(),
		voltageSystem: voltageSystemSchema.nullable().optional(),
		hasAuxiliaryPowerUnit: z.boolean().nullable().optional(),

		wallMaterial: wallMaterialSchema.nullable().optional(),
		floorMaterial: floorMaterialSchema.nullable().optional(),
		rearDoorType: rearDoorTypeSchema.nullable().optional(),
		hasSideDoor: z.boolean().nullable().optional(),
		interiorHeightMeters: z.number().positive().nullable().optional(),

		ownership: ownershipSchema.optional(),
	})
	.superRefine((data, ctx) => {
		if (
			data.pbvdKg !== undefined &&
			data.taraKg !== undefined &&
			data.pbvdKg <= data.taraKg
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "pbvdKg debe ser mayor a taraKg",
				path: ["pbvdKg"],
			});
		}
	});

export const updateTrailerSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: updateTrailerBodySchema,
});

export const trailerIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export const transitionStatusSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		newStatus: trailerStatusSchema,
		reason: z.string().max(500).nullable().optional(),
	}),
});

export const decodeVinSchema = z.object({
	body: z.object({
		vin: z.string().min(1).max(17),
	}),
});

export const checkDuplicateSchema = z.object({
	body: z.object({
		vin: z.string().min(1).max(17).nullable().optional(),
		plates_mx: z.string().min(1).max(20).nullable().optional(),
		plates_us: z.string().min(1).max(20).nullable().optional(),
		economicNumber: z.string().min(1).max(40).nullable().optional(),
		excludeTrailerId: z.string().length(24).nullable().optional(),
	}),
});

export const listTrailersSchema = z.object({
	query: z.object({
		status: trailerStatusSchema.optional(),
		ctrSubtype: z.string().regex(/^CTR\d{3}$/i).optional(),
		ownershipType: ownershipTypeSchema.optional(),
		search: z.string().max(200).optional(),
		page: z.coerce.number().min(1).optional(),
		limit: z.coerce.number().min(1).max(100).optional(),
		sortField: z
			.enum([
				"economicNumber",
				"vin",
				"createdAt",
				"updatedAt",
				"modelYear",
				"status",
				"ctrSubtype",
			])
			.optional(),
		sortDirection: z.enum(["asc", "desc"]).optional(),
	}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateTrailerInput = z.infer<typeof createTrailerSchema>;
export type QuickRegisterInput = z.infer<typeof quickRegisterTrailerSchema>;
export type UpdateTrailerInput = z.infer<typeof updateTrailerSchema>;
export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;
export type ListTrailersInput = z.infer<typeof listTrailersSchema>;
export type DecodeVinInput = z.infer<typeof decodeVinSchema>;
