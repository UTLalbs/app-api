import type {ObjectId} from "mongodb";

// ── Enums ──────────────────────────────────────────────────────────────────

export type UserStatus = "pending" | "active" | "inactive" | "suspended";
export type UserType = "internal" | "client_contact" | "super_admin";

// ── Subdocumentos — Teléfonos ──────────────────────────────────────────────

export interface PhoneEntry {
	code: "+52" | "+1";
	number: string;
	type: "personal" | "office";
}

// ── Subdocumentos — Roles ──────────────────────────────────────────────────

export interface UserRole {
	roleId: ObjectId;
	name: string;
}

export interface UserRoleDto {
	roleId: string;
	name: string;
}

// ── Subdocumentos — Identidades ────────────────────────────────────────────

export interface LocalIdentity {
	passwordHash: string | null;
	passwordHistory: string[];
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
	timezone: string | null; // ← null = heredar de la org
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
	numInt: string;
	suburb: {name: string; code: string};
	town: {name: string; code: string};
	state: {name: string; code: string};
	location: {name: string; code: string};
	city: {name: string; code: string};
	country: {name: string; code: string};
	cp: string;
	reference?: string;
}

// ── Subdocumentos — Employee Documents ────────────────────────────────────

export interface EmployeeDocument {
	type: "ine" | "nss" | "contrato" | "licencia" | "otro";
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

// ── Subdocumentos — Driver License ────────────────────────────────────────

export interface DriverLicense {
	type: "federal" | "estatal" | "utilitaria";
	number: string;
	class: "A" | "B" | "C" | "D" | "E";
	issuedAt: Date;
	expiresAt: Date;
	state: string | null;
	fileUrl: string | null;
}

// ── Subdocumentos — Medical Exam ──────────────────────────────────────────

export interface MedicalExam {
	folio: string;
	issuedAt: Date;
	expiresAt: Date;
	result: "apto" | "apto_con_restricciones" | "no_apto";
	restrictions: string | null;
	issuedBy: string;
	licenseNumber: string;
	fileUrl: string | null;
}

// ── Subdocumentos — Vehicle Operator ──────────────────────────────────────

export interface VehicleOperator {
	isOperator: boolean;
	driverStatus: "available" | "on_trip" | "off_duty" | null;
	currentUnitId: ObjectId | null;
	licenses: DriverLicense[];
	medicalExam: MedicalExam | null;
	passport: {
		number: string;
		expiresAt: Date;
		fileUrl: string | null;
	} | null;
	visa: {
		type: "B1/B2" | "FAST" | "otro";
		number: string;
		expiresAt: Date;
		fileUrl: string | null;
	} | null;
}

// ── Subdocumentos — Employee Profile ──────────────────────────────────────

export interface EmployeeProfile {
	isEmployee: boolean;
	position: string;
	department: string;
	dateOfHire: Date;
	curp: string;
	rfc: string;
	razonSocial: string;
	regimenFiscal: {code: string; name: string} | null;
	address: Address | null;
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
	orgId: ObjectId | null;
	userType: UserType;
	displayName: string;
	firstName: string;
	lastName: string;
	email: string;
	isGroup: boolean;
	groupAlias: string | null;
	phones: PhoneEntry[];
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
	isGroup: boolean;
	groupAlias: string | null;
	phones: PhoneEntry[];
	status: UserStatus;
	roles: UserRoleDto[];
	employeeProfile: EmployeeProfile | null;
	clientMemberships:
		| {
				clientId: string;
				alias: string;
				access: string[];
				isDefault: boolean;
		  }[]
		| null;
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
	phones?: PhoneEntry[];
	roles?: UserRoleDto[];
	clientId?: string | null;
	identities?: Partial<UserIdentities>;
	employeeProfile?: EmployeeProfile | null;
	clientMemberships?: ClientMembership[] | null;
	isGroup?: boolean;
	groupAlias?: string | null;
}

export interface UpdateUserDto {
	displayName?: string;
	firstName?: string;
	lastName?: string;
	phones?: PhoneEntry[];
	status?: UserStatus;
	roles?: UserRoleDto[];
	clientId?: string | null;
	preferences?: Partial<UserPreferences>;
	employeeProfile?: EmployeeProfile | null;
	clientMemberships?: ClientMembership[] | null;
	isGroup?: boolean;
	groupAlias?: string | null;
}

// ── Filtros de consulta ────────────────────────────────────────────────────
export interface UserQueryFilter {
  status?:   string;
  userType?: string;
  isGroup?:  boolean;
}
