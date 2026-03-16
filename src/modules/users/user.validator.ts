import { z } from 'zod';

// ── Subdocumentos ──────────────────────────────────────────────────────────

const userRoleSchema = z.object({
  roleId: z.string().length(24),
  name:   z.string().min(1),
});

const addressSchema = z.object({
  street:  z.string().min(1),
  numExt:  z.string().min(1),
  numInt:  z.string().nullable().optional(),
  suburb:  z.object({ code: z.string(), name: z.string() }),
  city:    z.object({ code: z.string(), name: z.string() }),
  state:   z.object({ code: z.string(), name: z.string() }),
  country: z.object({ code: z.string(), name: z.string() }),
  cp:      z.string().min(5).max(10),
});

const driverLicenseSchema = z.object({
  type:     z.enum(['federal', 'estatal', 'utilitaria']),
  number:   z.string().min(1),
  class:    z.enum(['A', 'B', 'C', 'D', 'E']),
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  state:    z.string().nullable().optional(),
  fileUrl:  z.string().url().nullable().optional(),
});

const vehicleOperatorSchema = z.object({
  licenses: z.array(driverLicenseSchema).min(1),
  passport: z.object({
    number:    z.string().min(1),
    expiresAt: z.coerce.date(),
    fileUrl:   z.string().url().nullable().optional(),
  }).nullable().optional(),
  visa: z.object({
    type:      z.enum(['B1/B2', 'FAST', 'otro']),
    number:    z.string().min(1),
    expiresAt: z.coerce.date(),
    fileUrl:   z.string().url().nullable().optional(),
  }).nullable().optional(),
  currentUnitId: z.string().length(24).nullable().optional(),
  driverStatus:  z.enum(['available', 'on_trip', 'off_duty']).nullable().optional(),
});

const employeeDocumentSchema = z.object({
  type:       z.enum(['ine', 'nss', 'contrato', 'licencia', 'otro']),
  fileUrl:    z.string().url(),
  expiresAt:  z.coerce.date().nullable().optional(),
  verifiedAt: z.coerce.date().nullable().optional(),
});

const employeeProfileSchema = z.object({
  rfc:       z.string().min(12).max(13),
  curp:      z.string().length(18),
  dateOfHire: z.coerce.date(),
  address:   addressSchema,
  documents: z.array(employeeDocumentSchema).default([]),
  certifications: z.array(z.object({
    name:      z.string().min(1),
    issuedBy:  z.string().min(1),
    number:    z.string().min(1),
    issuedAt:  z.coerce.date(),
    expiresAt: z.coerce.date(),
    fileUrl:   z.string().url().nullable().optional(),
  })).default([]),
  vehicleOperator: vehicleOperatorSchema.nullable().optional(),
});

const clientMembershipSchema = z.object({
  clientId:  z.string().length(24),
  alias:     z.string().min(1),
  access:    z.array(z.string()).default(['all']),
  isDefault: z.boolean().default(false),
});

// ── Schemas principales ────────────────────────────────────────────────────

export const createUserSchema = z.object({
  body: z.object({
    email:       z.string().email(),
    displayName: z.string().min(2).max(100),
    firstName:   z.string().min(1).max(50).optional(),
    lastName:    z.string().min(1).max(50).optional(),
    phone:       z.array(z.string()).nullable().optional(),
    userType:    z.enum(['internal', 'client_contact', 'super_admin']).optional(),
    roles:       z.array(userRoleSchema).optional(),
    clientId:    z.string().length(24).nullable().optional(),
    employeeProfile:   employeeProfileSchema.nullable().optional(),
    clientMemberships: z.array(clientMembershipSchema).nullable().optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    displayName: z.string().min(2).max(100).optional(),
    firstName:   z.string().min(1).max(50).optional(),
    lastName:    z.string().min(1).max(50).optional(),
    phone:       z.array(z.string()).nullable().optional(),
    roles:       z.array(userRoleSchema).optional(),
    clientId:    z.string().length(24).nullable().optional(),
    employeeProfile:   employeeProfileSchema.nullable().optional(),
    clientMemberships: z.array(clientMembershipSchema).nullable().optional(),
  }),
});

export const changeStatusSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    status: z.enum(['active', 'inactive', 'suspended', 'pending']),
  }),
});

export const listUsersSchema = z.object({
  query: z.object({
    status:   z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
    userType: z.enum(['internal', 'client_contact', 'super_admin']).optional(),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateUserInput  = z.infer<typeof createUserSchema>;
export type UpdateUserInput  = z.infer<typeof updateUserSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ListUsersInput   = z.infer<typeof listUsersSchema>;