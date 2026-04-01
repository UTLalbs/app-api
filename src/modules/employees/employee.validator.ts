import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────

const employeeTypeSchema = z.enum(['operator', 'admin']);

const positionSchema = z.enum([
  'border_driver', 'national_driver', 'manager',
  'mechanic', 'executive', 'security_guard',
  'k9_inspector', 'janitor', 'messenger',
]);

const departmentSchema = z.enum([
  'operations', 'maintenance', 'administration',
  'accounting', 'security', 'human_resources',
]);

const employmentStatusSchema = z.enum(['active', 'leave', 'terminated']);
const driverStatusSchema     = z.enum(['available', 'on_trip', 'off_duty']);
const documentStatusSchema   = z.enum(['pending', 'verified', 'expired', 'rejected']);
const checklistStatusSchema  = z.enum(['pending', 'complete', 'waived']);

const documentTypeSchema = z.enum([
  'ine', 'curp', 'nss',
  'employment_contract', 'internal_regulations',
  'employment_application', 'proof_of_address',
  'background_check', 'tax_certificate',
  'socioeconomic_study', 'federal_license',
  'state_license', 'sct_medical_exam',
  'company_medical_exam', 'drug_test_mx',
  'drug_test_us', 'dot_physical', 'passport',
  'visa', 'fast_card', 'mvr_report', 'psp_report',
  'technical_certification', 'other',
]);

// ── Subdocumentos ──────────────────────────────────────────────────────────

const addressSchema = z.object({
  street:   z.string().default(''),
  numExt:   z.string().default(''),
  numInt:   z.string().default(''),
  suburb:   z.object({ name: z.string(), code: z.string() }),
  town:     z.object({ name: z.string(), code: z.string() }),
  state:    z.object({ name: z.string(), code: z.string() }),
  location: z.object({ name: z.string(), code: z.string() }),
  city:     z.object({ name: z.string(), code: z.string() }),
  country:  z.object({ name: z.string(), code: z.string() }),
  cp:       z.string().min(4).max(10),
  reference: z.string().optional(),
});

const regimenFiscalSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

// ── Employee profile patch ─────────────────────────────────────────────────

export const updateEmployeeProfileSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    employeeType:      employeeTypeSchema.nullable().optional(),
    position:          positionSchema.nullable().optional(),
    department:        departmentSchema.nullable().optional(),
    managerId:         z.string().length(24).nullable().optional(),
    dateOfHire:        z.coerce.date().nullable().optional(),
    employmentStatus:  employmentStatusSchema.optional(),
    curp:              z.string().max(18).nullable().optional(),
    rfc:               z.string().max(13).nullable().optional(),
    razonSocial:       z.string().max(200).nullable().optional(),
    regimenFiscal:     regimenFiscalSchema.nullable().optional(),
    address:           addressSchema.nullable().optional(),
  }),
});

// ── List employees ─────────────────────────────────────────────────────────

export const listEmployeesSchema = z.object({
  query: z.object({
    search:           z.string().optional(),
    department:       departmentSchema.optional(),
    employeeType:     employeeTypeSchema.optional(),
    position:         positionSchema.optional(),
    driverStatus:     driverStatusSchema.optional(),
    employmentStatus: employmentStatusSchema.optional(),
  }),
});

// ── Employee ID param ──────────────────────────────────────────────────────

export const employeeIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

// ── Emergency contacts ─────────────────────────────────────────────────────

export const createEmergencyContactSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name:         z.string().min(1).max(100),
    relationship: z.string().min(1).max(100),
    phone:        z.string().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos'),
    phoneCode:    z.enum(['+52', '+1']).default('+52'),
  }),
});

export const updateEmergencyContactSchema = z.object({
  params: z.object({
    id:        z.string().length(24),
    contactId: z.string().length(24),
  }),
  body: z.object({
    name:         z.string().min(1).max(100).optional(),
    relationship: z.string().min(1).max(100).optional(),
    phone:        z.string().regex(/^\d{10}$/).optional(),
    phoneCode:    z.enum(['+52', '+1']).optional(),
  }),
});

export const contactIdParamSchema = z.object({
  params: z.object({
    id:        z.string().length(24),
    contactId: z.string().length(24),
  }),
});

// ── Bank accounts ──────────────────────────────────────────────────────────

export const createBankAccountSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    bankName:      z.string().min(1).max(100),
    accountNumber: z.string().min(10).max(20),
    clabe:         z.string().length(18),
    isDefault:     z.boolean().default(false),
    documentUrl:   z.string().url().nullable().optional(),
  }),
});

export const updateBankAccountSchema = z.object({
  params: z.object({
    id:        z.string().length(24),
    accountId: z.string().length(24),
  }),
  body: z.object({
    bankName:    z.string().min(1).max(100).optional(),
    isDefault:   z.boolean().optional(),
    documentUrl: z.string().url().nullable().optional(),
  }),
});

export const accountIdParamSchema = z.object({
  params: z.object({
    id:        z.string().length(24),
    accountId: z.string().length(24),
  }),
});

// ── Documents ──────────────────────────────────────────────────────────────

export const uploadDocumentSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    type:      documentTypeSchema,
    name:      z.string().min(1).max(200),
    issuedAt:  z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    alertDays: z.coerce.number().min(1).max(365).default(30),
  }),
});

export const updateDocumentSchema = z.object({
  params: z.object({
    id:    z.string().length(24),
    docId: z.string().length(24),
  }),
  body: z.object({
    status:     documentStatusSchema.optional(),
    notes:      z.string().nullable().optional(),
    expiresAt:  z.string().datetime().nullable().optional(),
    alertDays:  z.coerce.number().min(1).max(365).optional(),
    verifiedAt: z.string().datetime().nullable().optional(),
    verifiedBy: z.string().length(24).nullable().optional(),
  }),
});

export const docIdParamSchema = z.object({
  params: z.object({
    id:    z.string().length(24),
    docId: z.string().length(24),
  }),
});

// ── Checklist ──────────────────────────────────────────────────────────────

export const generateChecklistSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    employeeType: employeeTypeSchema,
    position:     positionSchema.nullable().optional(),
  }),
});

export const createChecklistItemSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    type:     z.string().min(1),
    label:    z.string().min(1).max(200),
    required: z.boolean().default(true),
  }),
});

export const updateChecklistItemSchema = z.object({
  params: z.object({
    id:     z.string().length(24),
    itemId: z.string().length(24),
  }),
  body: z.object({
    required:     z.boolean().optional(),
    status:       checklistStatusSchema.optional(),
    documentId:   z.string().length(24).nullable().optional(),
    waivedReason: z.string().min(1).nullable().optional(),
  }),
});

export const itemIdParamSchema = z.object({
  params: z.object({
    id:     z.string().length(24),
    itemId: z.string().length(24),
  }),
});

// ── Audit log ──────────────────────────────────────────────────────────────

export const auditLogQuerySchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  query: z.object({
    field: z.string().optional(),
    from:  z.string().datetime().optional(),
    to:    z.string().datetime().optional(),
    limit: z.coerce.number().min(1).max(200).default(50),
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type ListEmployeesInput          = z.infer<typeof listEmployeesSchema>;
export type UpdateEmployeeProfileInput  = z.infer<typeof updateEmployeeProfileSchema>;
export type CreateEmergencyContactInput = z.infer<typeof createEmergencyContactSchema>;
export type UpdateEmergencyContactInput = z.infer<typeof updateEmergencyContactSchema>;
export type CreateBankAccountInput      = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput      = z.infer<typeof updateBankAccountSchema>;
export type UploadDocumentInput         = z.infer<typeof uploadDocumentSchema>;
export type UpdateDocumentInput         = z.infer<typeof updateDocumentSchema>;
export type GenerateChecklistInput      = z.infer<typeof generateChecklistSchema>;
export type CreateChecklistItemInput    = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput    = z.infer<typeof updateChecklistItemSchema>;
export type AuditLogQueryInput          = z.infer<typeof auditLogQuerySchema>;