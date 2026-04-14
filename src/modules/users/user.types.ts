import type { ObjectId } from 'mongodb';

import type { EmployeeProfile, EmployeeProfileDocument } from '../hr/employees/employee.types';


// ── Enums ──────────────────────────────────────────────────────────────────

export type UserStatus = 'pending' | 'active' | 'inactive' | 'suspended';
export type UserType   = 'internal' | 'client_contact' | 'super_admin';

// ── Subdocumentos — Teléfonos ──────────────────────────────────────────────

export interface PhoneEntry {
  code:   '+52' | '+1';
  number: string;
  type:   'personal' | 'office';
}

// ── Subdocumentos — Roles ──────────────────────────────────────────────────

export interface UserRole {
  roleId: ObjectId;
  name:   string;
}

export interface UserRoleDto {
  roleId: string;
  name:   string;
}

// ── Subdocumentos — Identidades ────────────────────────────────────────────

export interface LocalIdentity {
  passwordHash:    string | null;
  passwordHistory: string[];
  mfaEnabled:      boolean;
  mfaSecret:       string | null;
}

export interface OAuthIdentity {
  sub:         string;
  email:       string;
  connectedAt: Date;
}

export interface UserIdentities {
  local:     LocalIdentity | null;
  google:    OAuthIdentity | null;
  microsoft: OAuthIdentity | null;
}

// ── Subdocumentos — Preferencias ───────────────────────────────────────────

export interface UserPreferences {
  language:  string;
  timezone:  string | null;
  notifications: {
    push: boolean;
  };
}

// ── Subdocumentos — Terms ──────────────────────────────────────────────────

export interface TermsAgreement {
  accepted:   boolean;
  acceptedAt: Date;
  version:    string;
}

// ── Subdocumentos — Client Memberships ────────────────────────────────────

export interface ClientMembership {
  clientId:  ObjectId;
  alias:     string;
  access:    string[];
  isDefault: boolean;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface UserDocument {
  _id:               ObjectId;
  orgId:             ObjectId | null;
  userType:          UserType;
  displayName:       string;
  firstName:         string;
  lastName:          string;
  email:             string;
  isGroup:           boolean;
  groupAlias:        string | null;
  phones:            PhoneEntry[];
  status:            UserStatus;
  roles:             UserRole[];
  employeeProfile:   EmployeeProfileDocument | null;   // ← importado de employee.types
  clientMemberships: ClientMembership[] | null;
  identities:        UserIdentities;
  preferences:       UserPreferences;
  termsAgreement:    TermsAgreement | null;
  clientId:          ObjectId | null;
  lastLoginAt:       Date | null;
  createdAt:         Date;
  updatedAt:         Date;
  deletedAt:         Date | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface User {
  id:          string;
  orgId:       string | null;
  userType:    UserType;
  displayName: string;
  firstName:   string;
  lastName:    string;
  email:       string;
  isGroup:     boolean;
  groupAlias:  string | null;
  phones:      PhoneEntry[];
  status:      UserStatus;
  roles:       UserRoleDto[];
  employeeProfile:   EmployeeProfile | null;   // ← importado de employee.types
  clientMemberships: {
    clientId:  string;
    alias:     string;
    access:    string[];
    isDefault: boolean;
  }[] | null;
  identities: {
    google:    OAuthIdentity | null;
    microsoft: OAuthIdentity | null;
  };
  preferences:    UserPreferences;
  termsAgreement: TermsAgreement | null;
  clientId:       string | null;
  lastLoginAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateUserDto {
  orgId:       string;
  userType?:   UserType;
  email:       string;
  displayName: string;
  firstName?:  string;
  lastName?:   string;
  isGroup?:    boolean;
  groupAlias?: string | null;
  phones?:     PhoneEntry[];
  roles?:      UserRoleDto[];
  clientId?:   string | null;
  identities?: Partial<UserIdentities>;
  employeeProfile?:   EmployeeProfile | null;
  clientMemberships?: ClientMembership[] | null;
}

export interface UpdateUserDto {
  displayName?: string;
  firstName?:   string;
  lastName?:    string;
  isGroup?:     boolean;
  groupAlias?:  string | null;
  phones?:      PhoneEntry[];
  status?:      UserStatus;
  roles?:       UserRoleDto[];
  clientId?:    string | null;
  preferences?: Partial<UserPreferences>;
  employeeProfile?:   EmployeeProfile | null;
  clientMemberships?: ClientMembership[] | null;
}

// ── Filtros de consulta ────────────────────────────────────────────────────
export interface UserQueryFilter {
	status?: string;
	userType?: string;
	isGroup?: boolean;
	orgId?: string;
}
