import {z} from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────

// `position` y `department` ya no son enums fijos — son keys de catálogo
// per-org (colecciones `positions` y `departments`). Aceptamos cualquier
// string snake_case; la validación real vs. el catálogo vive en el service.
const catalogKeySchema = z
	.string()
	.min(1)
	.max(60)
	.regex(/^[a-z0-9_]+$/);

const employmentStatusSchema = z.enum([
  'active',
  'leave',
  'vacation',
  'disability',
  'suspended',
  'terminated',
]);
const driverStatusSchema = z.enum(["available", "on_trip", "off_duty"]);
const documentStatusSchema = z.enum([
	"pending",
	"verified",
	"expired",
	"rejected",
]);

const renewalFromSchema = z.enum(["upload_date", "expiry_date"]);

const documentTypeSchema = z.enum([
	"ine",
	"curp",
	"nss",
	"employment_contract",
	"internal_regulations",
	"employment_application",
	"proof_of_address",
	"background_check",
	"tax_certificate",
	"bank_account",
	"socioeconomic_study",
	"federal_license",
	"state_license",
	"sct_medical_exam",
	"company_medical_exam",
	"drug_test_mx",
	"drug_test_us",
	"dot_physical",
	"passport",
	"visa",
	"customs_badge", // ← agregar
	"fast_card",
	"mvr_report",
	"psp_report",
	"technical_certification",
	"other",
]);

const waivedReasonSchema = z.enum([
	"not_applicable",
	"pending_process",
	"foreign_employee",
	"external_contractor",
	"director_approval",
	"other",
]);

// ── Subdocumentos ──────────────────────────────────────────────────────────

const addressSchema = z.object({
	street: z.string().default(""),
	numExt: z.string().default(""),
	numInt: z.string().default(""),
	suburb: z.object({name: z.string(), code: z.string()}),
	town: z.object({name: z.string(), code: z.string()}),
	state: z.object({name: z.string(), code: z.string()}),
	location: z.object({name: z.string(), code: z.string()}),
	city: z.object({name: z.string(), code: z.string()}),
	country: z.object({name: z.string(), code: z.string()}),
	cp: z.string().min(4).max(10),
	reference: z.string().optional(),
});

const regimenFiscalSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
});

// ── Validación de dirección actual con lógica sameAsFiscal ─────────────────
const currentAddressSchema = z
	.object({
		sameAsFiscal: z.boolean().default(true),
		address: addressSchema.nullable().optional(),
	})
	.transform((val) => {
		// Si sameAsFiscal = true → address siempre null
		if (val.sameAsFiscal) return {sameAsFiscal: true, address: null};
		return val;
	});

// ── Vehicle Operator ───────────────────────────────────────────────────────

// `class` puede venir como string (clients legacy que solo soportan 1 clase) o como
// array (nuevos clientes multi-clase). Normalizamos a array siempre.
const driverLicenseClassSchema = z.preprocess(
	(v) => (typeof v === "string" ? [v] : v),
	z.array(z.enum(["A", "B", "C", "D", "E"])).min(1),
);

const driverLicenseSchema = z.object({
	type: z.enum(["federal", "estatal", "utilitaria"]),
	number: z.string().min(1),
	class: driverLicenseClassSchema,
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	state: z.string().nullable().optional(),
	country: z.enum(["MX", "US"]).default("MX"),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const medicalExamSchema = z.object({
	number: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	result: z.enum(["apto", "apto_con_restricciones", "no_apto"]),
	restrictions: z.string().nullable().optional(),
	issuedBy: z.string().min(1),
	licenseNumber: z.string().min(1),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const drugTestSchema = z.object({
	date: z.coerce.date(),
	result: z.enum(["negative", "positive", "pending"]),
	laboratory: z.string().min(1),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const passportSchema = z.object({
	number: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	country: z.string().default("MEX"),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const visaSchema = z.object({
	type: z.enum(["B1/B2", "FM3", "other"]),
	number: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const fastCardSchema = z.object({
	number: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	fileUrl: z.string().url().nullable().optional(),
	alertDays: z.coerce.number().default(30),
});

const fmcsaSchema = z
	.object({
		cdlNumber: z.string().nullable().optional(),
		dotPhysical: z
			.object({
				issuedAt: z.coerce.date(),
				expiresAt: z.coerce.date(),
				issuedBy: z.string().min(1),
				fileUrl: z.string().url().nullable().optional(),
				alertDays: z.coerce.number().default(30),
			})
			.nullable()
			.optional(),
		drugTest: drugTestSchema.nullable().optional(),
		alcoholTest: z
			.object({
				date: z.coerce.date(),
				result: z.enum(["negative", "positive", "pending"]),
				laboratory: z.string().min(1),
				fileUrl: z.string().url().nullable().optional(),
			})
			.nullable()
			.optional(),
		mvrReport: z
			.object({
				date: z.coerce.date(),
				fileUrl: z.string().url().nullable().optional(),
			})
			.nullable()
			.optional(),
		pspReport: z
			.object({
				date: z.coerce.date(),
				fileUrl: z.string().url().nullable().optional(),
			})
			.nullable()
			.optional(),
	})
	.nullable()
	.optional();

const vehicleOperatorSchema = z.object({
	isOperator: z.boolean().default(false),
	driverStatus: driverStatusSchema.nullable().optional(),
	currentUnitId: z.string().length(24).nullable().optional(),
	licenses: z.array(driverLicenseSchema).default([]),
	medicalExam: medicalExamSchema.nullable().optional(),
	drugTestMx: drugTestSchema.nullable().optional(),
	passport: passportSchema.nullable().optional(),
	visa: visaSchema.nullable().optional(),
	fastCard: fastCardSchema.nullable().optional(),
	fmcsa: fmcsaSchema,
});

// ── Work schedule (patrón base del empleado) ──────────────────────────────

const jornadaTypeSchema = z.enum([
	"diurna",
	"nocturna",
	"mixta",
	"acumulada",
	"por_viaje",
]);

const dayOfWeekSchema = z.enum([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
]);

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const shiftTypeSchema = z.enum([
	"regular",
	"mixed",
	"inhouse",
	"multi_day",
	"coverage",
	"training",
]);

const dayShiftSchema = z
	.object({
		shiftType: shiftTypeSchema,
		startTime: timeStringSchema,
		endTime: timeStringSchema,
		multiDay: z.boolean().default(false),
		endDayOffset: z.number().int().min(0).max(7).default(0),
		startLocationId: z.string().length(24).nullable(),
		endLocationId: z.string().length(24).nullable(),
		applyAutoBreak: z.boolean().default(false),
		breakDurationMinutes: z.number().int().min(0).max(120).default(0),
		breakStartTime: timeStringSchema.nullable().default(null),
		breakEndTime: timeStringSchema.nullable().default(null),
		notes: z.string().max(500).nullable().default(null),
	})
	.refine(
		(s) => {
			if (!s.breakStartTime || !s.breakEndTime) return true;
			return s.breakEndTime > s.breakStartTime;
		},
		{message: "breakEndTime debe ser mayor que breakStartTime"},
	)
	.refine(
		(s) => {
			if (!s.breakStartTime || !s.breakEndTime) return true;
			// Best-effort: si no es multi-day, validar que el descanso quede dentro
			// del rango del turno.
			if (s.multiDay) return true;
			return s.breakStartTime >= s.startTime && s.breakEndTime <= s.endTime;
		},
		{message: "El descanso debe quedar dentro del rango del turno"},
	);

const weeklyPatternSchema = z.object({
	monday: dayShiftSchema.nullable(),
	tuesday: dayShiftSchema.nullable(),
	wednesday: dayShiftSchema.nullable(),
	thursday: dayShiftSchema.nullable(),
	friday: dayShiftSchema.nullable(),
	saturday: dayShiftSchema.nullable(),
	sunday: dayShiftSchema.nullable(),
});

const workScheduleModeSchema = z.enum(["fixed", "task_based"]);

const workScheduleSchema = z
	.object({
		mode: workScheduleModeSchema.default("fixed"),
		jornadaType: jornadaTypeSchema,
		templateId: z.string().length(24).nullable().optional(),
		customPattern: weeklyPatternSchema.nullable().optional(),
		weeklyMaxHours: z.number().min(1).max(80),
		restDays: z.array(dayOfWeekSchema).default([]),
		effectiveFrom: z.coerce.date(),
		effectiveTo: z.coerce.date().nullable().optional(),
	})
	.refine(
		(s) => {
			// Para task_based no se requiere patrón.
			if (s.mode === "task_based") return true;
			return !!(s.templateId || s.customPattern);
		},
		{message: "mode='fixed' requiere templateId o customPattern"},
	);

export const generateScheduleAssignmentsSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z
		.object({
			from: z.coerce.date(),
			to: z.coerce.date(),
		})
		.refine((d) => d.from <= d.to, {
			message: "from debe ser <= to",
		}),
});

// ── Employee profile patch ─────────────────────────────────────────────────

export const updateEmployeeProfileSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		position: catalogKeySchema.nullable().optional(),
		department: catalogKeySchema.nullable().optional(),
		managerId: z.string().length(24).nullable().optional(),
		profileId: z.string().length(24).nullable().optional(),
		dateOfHire: z.coerce.date().nullable().optional(),
		employmentStatus: employmentStatusSchema.optional(),
		curp: z.string().max(18).nullable().optional(),
		rfc: z.string().max(13).nullable().optional(),
		rfcValidatedAt: z.string().datetime().nullable().optional(),
		rfcValidatedStatus: z.enum(["pending", "valid", "invalid"]).optional(),
		razonSocial: z.string().max(200).nullable().optional(),
		regimenFiscal: regimenFiscalSchema.nullable().optional(),
		address: addressSchema.nullable().optional(),
		currentAddress: currentAddressSchema.optional(),
		vehicleOperator: vehicleOperatorSchema.nullable().optional(),
		workSchedule: workScheduleSchema.nullable().optional(),
	}),
} );

// ── Update employment status ───────────────────────────────────────────────
export const updateEmploymentStatusSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    employmentStatus: z.enum([
      'active', 'leave', 'vacation',
      'disability', 'suspended', 'terminated',
    ]),
  }),
});

// ── List employees ─────────────────────────────────────────────────────────

export const listEmployeesSchema = z.object({
  query: z.object({
    search:              z.string().optional(),
    department:          catalogKeySchema.optional(),
    position:            catalogKeySchema.optional(),
    driverStatus:        driverStatusSchema.optional(),
    employmentStatus:    employmentStatusSchema.optional(),
    excludeTerminated:   z.enum(['true', 'false']).optional(),
  }),
});

// ── Employee ID param ──────────────────────────────────────────────────────

export const employeeIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

// ── Emergency contacts ─────────────────────────────────────────────────────

export const createEmergencyContactSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		name: z.string().min(1).max(100),
		relationship: z.string().min(1).max(100),
		phone: z.string().regex(/^\d{10}$/, "El teléfono debe tener 10 dígitos"),
		phoneCode: z.enum(["+52", "+1"]).default("+52"),
	}),
});

export const updateEmergencyContactSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		contactId: z.string().length(24),
	}),
	body: z.object({
		name: z.string().min(1).max(100).optional(),
		relationship: z.string().min(1).max(100).optional(),
		phone: z
			.string()
			.regex(/^\d{10}$/)
			.optional(),
		phoneCode: z.enum(["+52", "+1"]).optional(),
	}),
});

export const contactIdParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		contactId: z.string().length(24),
	}),
});

// ── Bank accounts ──────────────────────────────────────────────────────────

export const createBankAccountSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		bankName: z.string().min(1).max(100),
		accountNumber: z.string().min(10).max(20),
		clabe: z.string().length(18),
		isDefault: z.boolean().default(false),
		documentUrl: z.string().url().nullable().optional(),
	}),
});

export const updateBankAccountSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		accountId: z.string().length(24),
	}),
	body: z.object({
		bankName: z.string().min(1).max(100).optional(),
		isDefault: z.boolean().optional(),
		documentUrl: z.string().url().nullable().optional(),
	}),
});

export const accountIdParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		accountId: z.string().length(24),
	}),
});

// ── Documents ──────────────────────────────────────────────────────────────

export const uploadDocumentSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		type: documentTypeSchema,
		name: z.string().min(1).max(200),
		issuedAt: z.string().datetime().nullable().optional(),
		expiresAt: z.string().datetime().nullable().optional(),
		alertDays: z.coerce.number().min(0).max(365).default(0),
	}),
});

export const updateDocumentSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		docId: z.string().length(24),
	}),
	body: z.object({
		status: documentStatusSchema.optional(),
		notes: z.string().nullable().optional(),
		issuedAt: z.string().datetime().nullable().optional(),
		expiresAt: z.string().datetime().nullable().optional(),
		alertDays: z.coerce.number().min(0).max(365).optional(),
		hasRenewal: z.boolean().optional(), // ← agregar
		renewalMonths: z.coerce.number().min(1).max(120).nullable().optional(), // ← agregar
		renewalFrom: renewalFromSchema.optional(), // ← agregar
		renewalStartDate: z.string().datetime().nullable().optional(), // ← agregar
		verifiedAt: z.string().datetime().nullable().optional(),
		verifiedBy: z.string().length(24).nullable().optional(),
	}),
});

export const docIdParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		docId: z.string().length(24),
	}),
});

// ── Checklist ──────────────────────────────────────────────────────────────

export const generateChecklistSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		profileId: z.string().length(24).nullable().optional(),
	}),
});

export const createChecklistItemSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		type: z.string().min(1),
		label: z.string().min(1).max(200),
		required: z.boolean().default(true),
	}),
});

export const updateChecklistItemSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		itemId: z.string().length(24),
	}),
	body: z.object({
		required: z.boolean().optional(),
		status: z.enum(["complete", "pending", "waived"]).optional(),
		waivedReason: waivedReasonSchema.nullable().optional(),
		waivedNote: z.string().max(500).nullable().optional(),
		alertDays: z.coerce.number().min(0).nullable().optional(),
		hasExpiry: z.boolean().optional(),
		hasRenewal: z.boolean().optional(),
		renewalMonths: z.coerce.number().min(1).max(120).nullable().optional(),
		renewalFrom: renewalFromSchema.optional(),
		documentId: z.string().length(24).nullable().optional(),
	}),
});

export const itemIdParamSchema = z.object({
	params: z.object({
		id: z.string().length(24),
		itemId: z.string().length(24),
	}),
});


// ── Tipos inferidos ────────────────────────────────────────────────────────

export type ListEmployeesInput = z.infer<typeof listEmployeesSchema>;
export type UpdateEmployeeProfileInput = z.infer<
	typeof updateEmployeeProfileSchema
>;
export type CreateEmergencyContactInput = z.infer<
	typeof createEmergencyContactSchema
>;
export type UpdateEmergencyContactInput = z.infer<
	typeof updateEmergencyContactSchema
>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type GenerateChecklistInput = z.infer<typeof generateChecklistSchema>;
export type CreateChecklistItemInput = z.infer<
	typeof createChecklistItemSchema
>;
export type UpdateChecklistItemInput = z.infer<
	typeof updateChecklistItemSchema
>;

