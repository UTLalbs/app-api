import {z} from "zod";

// ── Subdocumentos ──────────────────────────────────────────────────────────

const phoneEntrySchema = z.object({
	code: z.enum(["+52", "+1"]),
	number: z.string().regex(/^\d{10}$/, "El teléfono debe tener 10 dígitos"),
	type: z.enum(["personal", "office"]),
});

const userRoleSchema = z.object({
	roleId: z.string().length(24),
	name: z.string().min(1),
});

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

const driverLicenseSchema = z.object({
	type: z.enum(["federal", "estatal", "utilitaria"]),
	number: z.string().min(1),
	class: z.enum(["A", "B", "C", "D", "E"]),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	state: z.string().nullable().optional(),
	fileUrl: z.string().url().nullable().optional(),
});

const medicalExamSchema = z.object({
	folio: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	result: z.enum(["apto", "apto_con_restricciones", "no_apto"]),
	restrictions: z.string().nullable().optional(),
	issuedBy: z.string().min(1),
	licenseNumber: z.string().min(1),
	fileUrl: z.string().url().nullable().optional(),
});

const vehicleOperatorSchema = z.object({
	isOperator: z.boolean().default(false),
	driverStatus: z
		.enum(["available", "on_trip", "off_duty"])
		.nullable()
		.optional(),
	currentUnitId: z.string().length(24).nullable().optional(),
	licenses: z.array(driverLicenseSchema).default([]),
	medicalExam: medicalExamSchema.nullable().optional(),
	passport: z
		.object({
			number: z.string().min(1),
			expiresAt: z.coerce.date(),
			fileUrl: z.string().url().nullable().optional(),
		})
		.nullable()
		.optional(),
	visa: z
		.object({
			type: z.enum(["B1/B2", "FAST", "otro"]),
			number: z.string().min(1),
			expiresAt: z.coerce.date(),
			fileUrl: z.string().url().nullable().optional(),
		})
		.nullable()
		.optional(),
});

const employeeDocumentSchema = z.object({
	type: z.enum(["ine", "nss", "contrato", "licencia", "otro"]),
	fileUrl: z.string().url(),
	expiresAt: z.coerce.date().nullable().optional(),
	verifiedAt: z.coerce.date().nullable().optional(),
});

const certificationSchema = z.object({
	name: z.string().min(1),
	issuedBy: z.string().min(1),
	number: z.string().min(1),
	issuedAt: z.coerce.date(),
	expiresAt: z.coerce.date(),
	fileUrl: z.string().url().nullable().optional(),
});

const employeeProfileSchema = z.object({
	isEmployee: z.boolean().default(false),
	position: z.string().default(""),
	department: z.string().default(""),
	dateOfHire: z.coerce.date().optional(),
	curp: z.string().max(18).default(""),
	rfc: z.string().max(13).default(""),
	razonSocial: z.string().default(""),
	regimenFiscal: z
		.object({
			code: z.string().min(1),
			name: z.string().min(1),
		})
		.nullable()
		.optional(),
	address: addressSchema.nullable().optional(),
	documents: z.array(employeeDocumentSchema).default([]),
	certifications: z.array(certificationSchema).default([]),
	vehicleOperator: vehicleOperatorSchema.nullable().optional(),
});

const clientMembershipSchema = z.object({
	clientId: z.string().length(24),
	alias: z.string().min(1),
	access: z.array(z.string()).default(["all"]),
	isDefault: z.boolean().default(false),
});

// ── Schemas principales ────────────────────────────────────────────────────

export const createUserSchema = z.object({
	body: z.object({
		email: z.string().email(),
		displayName: z.string().min(2).max(100),
		firstName: z.string().min(1).max(50).optional(),
		lastName: z.string().min(1).max(50).optional(),
		phones: z.array(phoneEntrySchema).max(2).optional(),
		userType: z.enum(["internal", "client_contact", "super_admin"]).optional(),
		roles: z.array(userRoleSchema).optional(),
		clientId: z.string().length(24).nullable().optional(),
		employeeProfile: employeeProfileSchema.nullable().optional(),
		clientMemberships: z.array(clientMembershipSchema).nullable().optional(),
	}),
});

export const updateUserSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		displayName: z.string().min(2).max(100).optional(),
		firstName: z.string().min(1).max(50).optional(),
		lastName: z.string().min(1).max(50).optional(),
		phones: z.array(phoneEntrySchema).max(2).optional(),
		roles: z.array(userRoleSchema).optional(),
		clientId: z.string().length(24).nullable().optional(),
		employeeProfile: employeeProfileSchema.nullable().optional(),
		clientMemberships: z.array(clientMembershipSchema).nullable().optional(),
		preferences: z
			.object({
				timezone: z.string().nullable().optional(),
			})
			.optional(),
	}),
});

export const changeStatusSchema = z.object({
	params: z.object({id: z.string().length(24)}),
	body: z.object({
		status: z.enum(["active", "inactive", "suspended", "pending"]),
	}),
});

export const listUsersSchema = z.object({
	query: z.object({
		status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
		userType: z.enum(["internal", "client_contact", "super_admin"]).optional(),
	}),
});

export const userIdParamSchema = z.object({
	params: z.object({id: z.string().length(24)}),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
