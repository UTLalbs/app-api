import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type UserStatus = 'pending' | 'active' | 'inactive' | 'suspended';
export type UserType = 'internal' | 'client_contact' | 'super_admin';

// ── Subdocumentos — Roles ──────────────────────────────────────────────────

export interface UserRole {
  roleId: ObjectId;
  name: string;   // snapshot del nombre para UI — no usar para auth
}

export interface UserRoleDto {
  roleId: string;
  name: string;
}

// ── Subdocumentos — Identidades ────────────────────────────────────────────

export interface LocalIdentity {
  passwordHash: string | null;
  passwordHistory: string[];   // últimos 5 hashes
  mfaEnabled: boolean;
  mfaSecret: string | null;
}

export interface OAuthIdentity {
  sub: string;
  email: string;
  connectedAt: Date;
}

export interface UserIdentities {
  local: LocalIdentity | null;
  google: OAuthIdentity | null;
  microsoft: OAuthIdentity | null;
}

// ── Subdocumentos — Preferencias ───────────────────────────────────────────

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: {
    push: boolean;
  };
}

// ── Subdocumentos — Terms ──────────────────────────────────────────────────

export interface TermsAgreement {
  accepted: boolean;
  acceptedAt: Date;
  version: string;
}

// ── Subdocumentos — Address ────────────────────────────────────────────────

export interface Address {
  street: string;
  numExt: string;
  numInt: string | null;
  suburb: { code: string; name: string };
  city:   { code: string; name: string };
  state:  { code: string; name: string };
  country: { code: string; name: string };
  cp: string;
}

// ── Subdocumentos — Employee Profile ──────────────────────────────────────

export interface EmployeeDocument {
  type: 'ine' | 'nss' | 'contrato' | 'licencia' | 'otro';
  fileUrl: string;
  expiresAt: Date | null;
  verifiedAt: Date | null;
}

export interface EmployeeCertification {
  name: string;
  issuedBy: string;
  number: string;
  issuedAt: Date;
  expiresAt: Date;
  fileUrl: string | null;
}

export interface DriverLicense {
  type: 'federal' | 'estatal' | 'utilitaria';
  number: string;
  class: 'A' | 'B' | 'C' | 'D' | 'E';
  issuedAt: Date;
  expiresAt: Date;
  state: string | null;
  fileUrl: string | null;
}

export interface VehicleOperator {
  licenses: DriverLicense[];
  passport: {
    number: string;
    expiresAt: Date;
    fileUrl: string | null;
  } | null;
  visa: {
    type: 'B1/B2' | 'FAST' | 'otro';
    number: string;
    expiresAt: Date;
    fileUrl: string | null;
  } | null;
  currentUnitId: ObjectId | null;
  driverStatus: 'available' | 'on_trip' | 'off_duty' | null;
}

export interface EmployeeProfile {
  rfc: string;
  curp: string;
  dateOfHire: Date;
  address: Address;
  documents: EmployeeDocument[];
  certifications: EmployeeCertification[];
  vehicleOperator: VehicleOperator | null;
}

// ── Subdocumentos — Client Memberships ────────────────────────────────────

export interface ClientMembership {
  clientId: ObjectId;
  alias: string;
  access: string[];
  isDefault: boolean;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface UserDocument {
  _id: ObjectId;
  orgId: ObjectId | null;        // null solo si userType = super_admin
  userType: UserType;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string[] | null;
  status: UserStatus;
  roles: UserRole[];
  employeeProfile: EmployeeProfile | null;
  clientMemberships: ClientMembership[] | null;
  identities: UserIdentities;
  preferences: UserPreferences;
  termsAgreement: TermsAgreement | null;
  clientId: ObjectId | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface User {
  id: string;
  orgId: string | null;
  userType: UserType;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string[] | null;
  status: UserStatus;
  roles: UserRoleDto[];
  employeeProfile: EmployeeProfile | null;
  clientMemberships: {
    clientId: string;
    alias: string;
    access: string[];
    isDefault: boolean;
  }[] | null;
  identities: {
    google: OAuthIdentity | null;
    microsoft: OAuthIdentity | null;
  };
  preferences: UserPreferences;
  termsAgreement: TermsAgreement | null;
  clientId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateUserDto {
  orgId: string;
  userType?: UserType;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string[] | null;
  roles?: UserRoleDto[];
  clientId?: string | null;
  identities?: Partial<UserIdentities>;
  employeeProfile?: EmployeeProfile | null;
  clientMemberships?: ClientMembership[] | null;
}

export interface UpdateUserDto {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string[] | null;
  status?: UserStatus;
  roles?: UserRoleDto[];
  clientId?: string | null;
  preferences?: Partial<UserPreferences>;
  employeeProfile?: Partial<EmployeeProfile> | null;
  clientMemberships?: ClientMembership[] | null;
}