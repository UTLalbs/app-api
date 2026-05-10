import {z} from "zod";

import {US_STATE_CODES} from "../../shared/constants/usStates.constants";

// ── Enums ──────────────────────────────────────────────────────────────────

const unitStatusSchema = z.enum([
	"available",
	"assigned",
	"in_route",
	"in_maintenance",
	"out_of_service",
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

const fuelTypeSchema = z.enum([
	"diesel",
	"gasoline",
	"cng",
	"lng",
	"lpg",
	"non_fossil",
	"electric",
	"hybrid",
	"hydrogen",
]);

const transmissionTypeSchema = z.enum(["manual", "automated_manual", "automatic"]);
const driveAxleConfigSchema = z.enum(["4x2", "6x2", "6x4", "8x4", "8x6", "4x4"]);
const cabTypeSchema = z.enum(["day_cab", "sleeper_mid", "sleeper_high"]);
const suspensionTypeSchema = z.enum(["air", "mechanical_leaf", "rigid", "hydraulic"]);
const brakeFrictionTypeSchema = z.enum(["drum", "disc"]);
const brakeActuationTypeSchema = z.enum(["air", "hydraulic", "inertia"]);
const tankPositionSchema = z.enum(["primary", "secondary", "tertiary"]);
const tankSideSchema = z.enum(["left", "right", "center"]);

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
		(p) => Boolean(p.mx) || Boolean(p.us),
		{message: "Al menos una placa (MX o US) es requerida"},
	)
	.refine(
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
		if (own.type === "owned" && !own.internalTaxIdId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "internalTaxIdId es requerido cuando ownership.type='owned'",
				path: ["internalTaxIdId"],
			});
		}
		if (own.type !== "owned" && !own.businessPartnerId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "businessPartnerId es requerido cuando ownership.type≠'owned'",
				path: ["businessPartnerId"],
			});
		}
		if (own.type === "leased_fixed_term" && !own.contract?.endDate) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "contract.endDate es requerido en arrendamientos a plazo fijo",
				path: ["contract", "endDate"],
			});
		}
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

const satConfigCodeSchema = z
	.string()
	.regex(/^[A-Z0-9]{2,8}$/, "satConfigCode debe ser 2-8 caracteres alfanuméricos");

const sctPermitTypeSchema = z
	.string()
	.regex(/^TPAF\d{2}$/i, "sctPermitType debe tener formato TPAFxx (ej. TPAF02)");

const fuelTypeSatCodeSchema = z
	.string()
	.regex(/^\d{2}$/, "fuelTypeCodeSAT debe ser 2 dígitos (ej. '02')");

const fuelTankSchema = z.object({
	position: tankPositionSchema,
	capacityL: z.number().positive("capacityL debe ser > 0"),
	side: tankSideSchema.nullable().optional(),
	notes: z.string().max(200).nullable().optional(),
});

// ── Schemas principales ────────────────────────────────────────────────────

const baseEngineShape = {
	fuelType: fuelTypeSchema,
	fuelTypeCodeSAT: fuelTypeSatCodeSchema.nullable().optional(),
	engineMake: z.string().max(120).nullable().optional(),
	engineModel: z.string().max(120).nullable().optional(),
	engineDisplacementL: z.number().positive().nullable().optional(),
	enginePowerHp: z.number().positive().nullable().optional(),
	engineTorqueLbFt: z.number().positive().nullable().optional(),
	fuelTanks: z.array(fuelTankSchema).max(10).nullable().optional(),
	defTankCapacityL: z.number().positive().nullable().optional(),
	nominalConsumptionLPer100Km: z.number().positive().nullable().optional(),
};

const baseTransmissionShape = {
	transmissionType: transmissionTypeSchema,
	transmissionMake: z.string().max(120).nullable().optional(),
	transmissionModel: z.string().max(120).nullable().optional(),
	driveAxleConfig: driveAxleConfigSchema,
	rearAxleRatio: z.number().positive().nullable().optional(),
};

const baseTechSpecsShape = {
	pbvKg: z.number().positive(),
	taraKg: z.number().positive(),
	gvwrLb: z.number().positive().nullable().optional(),
	lengthMeters: z.number().positive().nullable().optional(),
	widthMeters: z.number().positive().nullable().optional(),
	heightMeters: z.number().positive().nullable().optional(),
	axleCount: z.number().int().min(1).max(8),
	hasABS: z.boolean(),
	hasAuxiliaryPowerUnit: z.boolean(),
	cabType: cabTypeSchema.nullable().optional(),

	brakeFrictionType: brakeFrictionTypeSchema.nullable().optional(),
	brakeActuationType: brakeActuationTypeSchema.nullable().optional(),
	suspensionType: suspensionTypeSchema.nullable().optional(),
	suspensionBrand: z.string().max(120).nullable().optional(),
};

const createUnitBodySchema = z
	.object({
		// Bloque A
		vin: vinSchema,
		plates: platesSchema,
		satConfigCode: satConfigCodeSchema,
		sctPermitType: sctPermitTypeSchema.nullable().optional(),
		sctPermitNumber: z.string().max(40).nullable().optional(),
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
		color: z.string().max(60).nullable().optional(),
		engineNumber: z.string().max(60).nullable().optional(),
		nhtsaDecodedAt: z.coerce.date().nullable().optional(),
		nhtsaDecodeStatus: z
			.enum(["success", "partial", "failed", "not_attempted"])
			.nullable()
			.optional(),
		nhtsaRawData: z.record(z.string(), z.unknown()).nullable().optional(),

		// Bloque C
		...baseEngineShape,

		// Bloque D
		...baseTransmissionShape,

		// Bloque E + F
		...baseTechSpecsShape,

		// Bloque G
		ownership: ownershipSchema,
	})
	.superRefine((data, ctx) => {
		if (data.taraKg <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "taraKg debe ser > 0",
				path: ["taraKg"],
			});
		}
		if (data.pbvKg <= data.taraKg) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "pbvKg debe ser mayor a taraKg",
				path: ["pbvKg"],
			});
		}
	});

export const createUnitSchema = z.object({
	body: createUnitBodySchema,
});

const quickRegisterBodySchema = z.object({
	vin: vinSchema.nullable().optional(),
	plates: platesSchema,
	satConfigCode: satConfigCodeSchema,
	economicNumber: z.string().regex(ALPHANUM).max(40).nullable().optional(),
	make: z.string().max(120).nullable().optional(),
	makeCode: z.string().nullable().optional(),
	fuelType: fuelTypeSchema.nullable().optional(),
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

export const quickRegisterUnitSchema = z.object({
	body: quickRegisterBodySchema,
});

const updateUnitBodySchema = z
	.object({
		plates: platesSchema.optional(),
		satConfigCode: satConfigCodeSchema.optional(),
		sctPermitType: sctPermitTypeSchema.nullable().optional(),
		sctPermitNumber: z.string().max(40).nullable().optional(),
		economicNumber: z.string().regex(ALPHANUM).max(40).nullable().optional(),

		make: z.string().min(1).max(120).optional(),
		makeCode: z.string().nullable().optional(),
		model: z.string().nullable().optional(),
		modelYear: modelYearSchema.optional(),
		manufacturer: z.string().nullable().optional(),
		color: z.string().max(60).nullable().optional(),
		engineNumber: z.string().max(60).nullable().optional(),

		fuelType: fuelTypeSchema.optional(),
		fuelTypeCodeSAT: fuelTypeSatCodeSchema.nullable().optional(),
		engineMake: z.string().max(120).nullable().optional(),
		engineModel: z.string().max(120).nullable().optional(),
		engineDisplacementL: z.number().positive().nullable().optional(),
		enginePowerHp: z.number().positive().nullable().optional(),
		engineTorqueLbFt: z.number().positive().nullable().optional(),
		fuelTanks: z.array(fuelTankSchema).max(10).nullable().optional(),
		defTankCapacityL: z.number().positive().nullable().optional(),
		nominalConsumptionLPer100Km: z.number().positive().nullable().optional(),

		transmissionType: transmissionTypeSchema.optional(),
		transmissionMake: z.string().max(120).nullable().optional(),
		transmissionModel: z.string().max(120).nullable().optional(),
		driveAxleConfig: driveAxleConfigSchema.optional(),
		rearAxleRatio: z.number().positive().nullable().optional(),

		pbvKg: z.number().positive().optional(),
		taraKg: z.number().positive().optional(),
		gvwrLb: z.number().positive().nullable().optional(),
		lengthMeters: z.number().positive().nullable().optional(),
		widthMeters: z.number().positive().nullable().optional(),
		heightMeters: z.number().positive().nullable().optional(),
		axleCount: z.number().int().min(1).max(8).optional(),
		hasABS: z.boolean().optional(),
		hasAuxiliaryPowerUnit: z.boolean().optional(),
		cabType: cabTypeSchema.nullable().optional(),

		brakeFrictionType: brakeFrictionTypeSchema.nullable().optional(),
		brakeActuationType: brakeActuationTypeSchema.nullable().optional(),
		suspensionType: suspensionTypeSchema.nullable().optional(),
		suspensionBrand: z.string().max(120).nullable().optional(),

		ownership: ownershipSchema.optional(),
	})
	.superRefine((data, ctx) => {
		if (
			data.pbvKg !== undefined &&
			data.taraKg !== undefined &&
			data.pbvKg <= data.taraKg
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "pbvKg debe ser mayor a taraKg",
				path: ["pbvKg"],
			});
		}
	});

export const updateUnitSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: updateUnitBodySchema,
});

export const unitIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

export const transitionUnitStatusSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		newStatus: unitStatusSchema,
		reason: z.string().max(500).nullable().optional(),
	}),
});

export const decodeUnitVinSchema = z.object({
	body: z.object({
		vin: z.string().min(1).max(17),
	}),
});

export const checkUnitDuplicateSchema = z.object({
	body: z.object({
		vin: z.string().min(1).max(17).nullable().optional(),
		plates_mx: z.string().min(1).max(20).nullable().optional(),
		plates_us: z.string().min(1).max(20).nullable().optional(),
		economicNumber: z.string().min(1).max(40).nullable().optional(),
		excludeUnitId: z.string().length(24).nullable().optional(),
	}),
});

export const assignOperatorSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		operatorEmployeeId: z.string().length(24),
		notes: z.string().max(500).nullable().optional(),
	}),
});

export const unitPhotoParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		position: z.enum(["leftSide", "rightSide", "front", "rear"]),
	}),
});

export const listUnitsSchema = z.object({
	query: z.object({
		status: unitStatusSchema.optional(),
		satConfigCode: satConfigCodeSchema.optional(),
		ownershipType: ownershipTypeSchema.optional(),
		fuelType: fuelTypeSchema.optional(),
		hasOperator: z.coerce.boolean().optional(),
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
				"satConfigCode",
			])
			.optional(),
		sortDirection: z.enum(["asc", "desc"]).optional(),
	}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type QuickRegisterUnitInput = z.infer<typeof quickRegisterUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type TransitionUnitStatusInput = z.infer<typeof transitionUnitStatusSchema>;
export type ListUnitsInput = z.infer<typeof listUnitsSchema>;
export type DecodeUnitVinInput = z.infer<typeof decodeUnitVinSchema>;
export type CheckUnitDuplicateInput = z.infer<typeof checkUnitDuplicateSchema>;
export type AssignOperatorInput = z.infer<typeof assignOperatorSchema>;
