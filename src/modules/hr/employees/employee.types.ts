import type {ObjectId} from "mongodb";

// ── Enums ──────────────────────────────────────────────────────────────────
//
// `position` y `department` eran enums fijos; ahora son `string` (keys del
// catálogo per-org en las colecciones `positions` y `departments`). El tipo
// `EmployeeType` fue eliminado — la clasificación operador/admin quedó
// absorbida por `position`.

export type EmploymentStatus =
	| "active"
	| "leave"
	| "vacation"
	| "disability"
	| "suspended"
	| "terminated";

export type DriverStatus = "available" | "on_trip" | "off_duty";
export type DocumentStatus = "pending" | "verified" | "expired" | "rejected";
export type ChecklistStatus = "pending" | "complete" | "waived" | "expired";
export type DrugTestResult = "negative" | "positive" | "pending";
export type MedicalResult = "apto" | "apto_con_restricciones" | "no_apto";
export type RenewalFrom = "upload_date" | "expiry_date";

export type WaivedReason =
	| "not_applicable"
	| "pending_process"
	| "foreign_employee"
	| "external_contractor"
	| "director_approval"
	| "other";

export type DocumentType =
	| "ine"
	| "curp"
	| "nss"
	| "employment_contract"
	| "internal_regulations"
	| "employment_application"
	| "proof_of_address"
	| "background_check"
	| "tax_certificate"
	| "bank_account"
	| "socioeconomic_study"
	| "federal_license"
	| "state_license"
	| "sct_medical_exam"
	| "company_medical_exam"
	| "drug_test_mx"
	| "drug_test_us"
	| "dot_physical"
	| "passport"
	| "visa"
	| "customs_badge"
	| "fast_card"
	| "mvr_report"
	| "psp_report"
	| "technical_certification"
	| "other";

// ── Subdocumentos — Emergency Contact ─────────────────────────────────────

export interface EmergencyContact {
	_id: ObjectId;
	name: string;
	relationship: string;
	phone: string;
	phoneCode: "+52" | "+1";
}

// ── Subdocumentos — Bank Account ──────────────────────────────────────────

export interface BankAccount {
	_id: ObjectId;
	bankName: string;
	accountNumber: string; // AES-256 encrypted
	clabe: string; // AES-256 encrypted
	lastFour: string;
	documentUrl: string | null;
	isDefault: boolean;
	createdAt: Date;
}

// ── Subdocumentos — Driver Documents ──────────────────────────────────────

export type DriverLicenseClass = "A" | "B" | "C" | "D" | "E";

export interface DriverLicense {
	_id: ObjectId;
	type: "federal" | "estatal" | "utilitaria";
	number: string;
	// Una licencia puede habilitar múltiples clases (ej. ["A", "B"] — trailer + carga).
	// Backward-compat: docs antiguos pueden tener `class: string`; `toUser` los
	// normaliza a array al leer.
	class: DriverLicenseClass[];
	issuedAt: Date;
	expiresAt: Date;
	state: string | null;
	country: "MX" | "US";
	fileUrl: string | null;
	alertDays: number;
}

export interface MedicalExam {
	number: string;
	issuedAt: Date;
	expiresAt: Date;
	result: MedicalResult;
	restrictions: string | null;
	issuedBy: string;
	licenseNumber: string;
	fileUrl: string | null;
	alertDays: number;
}

export interface DrugTest {
	date: Date;
	result: DrugTestResult;
	laboratory: string;
	fileUrl: string | null;
	alertDays: number;
}

export interface Passport {
	number: string;
	issuedAt: Date;
	expiresAt: Date;
	country: string;
	fileUrl: string | null;
	alertDays: number;
}

export interface Visa {
	type: "B1/B2" | "FM3" | "other";
	number: string;
	issuedAt: Date;
	expiresAt: Date;
	fileUrl: string | null;
	alertDays: number;
}

export interface FastCard {
	number: string;
	issuedAt: Date;
	expiresAt: Date;
	fileUrl: string | null;
	alertDays: number;
}

export interface FmcsaDotPhysical {
	issuedAt: Date;
	expiresAt: Date;
	issuedBy: string;
	fileUrl: string | null;
	alertDays: number;
}

export interface FmcsaReport {
	date: Date;
	fileUrl: string | null;
}

export interface FmcsaAlcoholTest {
	date: Date;
	result: DrugTestResult;
	laboratory: string;
	fileUrl: string | null;
}

export interface FmcsaDrugTest {
	date: Date;
	result: DrugTestResult;
	laboratory: string;
	fileUrl: string | null;
	alertDays: number;
}

export interface Fmcsa {
	cdlNumber: string | null;
	dotPhysical: FmcsaDotPhysical | null;
	drugTest: FmcsaDrugTest | null;
	alcoholTest: FmcsaAlcoholTest | null;
	mvrReport: FmcsaReport | null;
	pspReport: FmcsaReport | null;
}

// ── Subdocumentos — Vehicle Operator ──────────────────────────────────────

export interface VehicleOperator {
	isOperator: boolean;
	driverStatus: DriverStatus | null;
	currentUnitId: ObjectId | null;
	licenses: DriverLicense[];
	medicalExam: MedicalExam | null;
	drugTestMx: DrugTest | null;
	passport: Passport | null;
	visa: Visa | null;
	fastCard: FastCard | null;
	fmcsa: Fmcsa | null;
}

// ── Subdocumentos — Documents ──────────────────────────────────────────────

export interface DocumentVersion {
	fileUrl: string;
	uploadedAt: Date;
	replacedBy: ObjectId;
}

export interface EmployeeDocument {
	_id: ObjectId;
	type: DocumentType;
	name: string;
	fileUrl: string;
	fileSize: number;
	mimeType: string;
	issuedAt: Date | null;
	expiresAt: Date | null;
	alertDays: number;
	hasRenewal: boolean; // ← nuevo
	renewalMonths: number | null; // ← nuevo
	renewalFrom: RenewalFrom; // ← nuevo
	renewalStartDate: Date | null; // ← nuevo
	replacedBy: ObjectId | null; // ← nuevo
	verifiedAt: Date | null;
	verifiedBy: ObjectId | null;
	status: DocumentStatus;
	notes: string | null;
	uploadedAt: Date;
	previousVersions: DocumentVersion[];
}

// ── Subdocumentos — Checklist ──────────────────────────────────────────────

export interface ChecklistItem {
	_id: ObjectId;
	type: string;
	label: string;
	required: boolean;
	status: ChecklistStatus;
	documentId: ObjectId | null;
	hasExpiry: boolean;
	alertDays: number | null;
	hasRenewal: boolean;
	renewalMonths: number | null;
	renewalFrom: RenewalFrom; // ← nuevo
	lastRenewedAt: Date | null;
	waivedBy: ObjectId | null;
	waivedAt: Date | null;
	waivedReason: WaivedReason | null;
	waivedNote: string | null;
}

// ── Tipo de dominio (response al frontend) ─────────────────────────────────
export interface ChecklistItemDto {
	_id: string;
	type: string;
	label: string;
	required: boolean;
	status: ChecklistStatus;
	documentId: string | null;
	hasExpiry: boolean;
	alertDays: number | null;
	hasRenewal: boolean;
	renewalMonths: number | null;
	renewalFrom: RenewalFrom;
	lastRenewedAt: Date | null;
	waivedBy: PopulatedUser | null; // ← poblado
	waivedAt: Date | null;
	waivedReason: WaivedReason | null;
	waivedNote: string | null;
}

// ── Populated types ────────────────────────────────────────────────────────

export interface PopulatedUser {
	id: string;
	displayName: string;
}

export interface ChecklistItemPopulated extends Omit<
	ChecklistItem,
	"waivedBy" | "_id" | "documentId"
> {
	_id: string;
	documentId: string | null;
	waivedBy: PopulatedUser | null;
}
// ── Employee Profile completo ──────────────────────────────────────────────

export interface EmployeeProfileDocument {
	isEmployee: boolean;
	// Keys de los catálogos `positions` y `departments` (per-org).
	// Null significa que el empleado aún no tiene puesto/departamento asignado.
	position: string | null;
	department: string | null;
	managerId: ObjectId | null;
	profileId: ObjectId | null;
	dateOfHire: Date | null;
	employmentStatus: EmploymentStatus;
	curp: string | null;
	rfc: string | null;
	rfcValidatedAt: Date | null;
	rfcValidatedStatus: "valid" | "invalid" | null;
	razonSocial: string | null;
	regimenFiscal: {code: string; name: string} | null;
	address: EmployeeAddress | null;
	currentAddress: CurrentAddress;
	emergencyContacts: EmergencyContact[];
	bankAccounts: BankAccount[];
	vehicleOperator: VehicleOperator | null;
	documents: EmployeeDocument[];
	checklist: ChecklistItem[]; // ← ObjectId
}

// ── Domain — para response al frontend ────────────────────────────────────
export interface EmployeeProfile extends Omit<
	EmployeeProfileDocument,
	"checklist"
> {
	checklist: ChecklistItemDto[]; // ← strings + populated
}

// ── Address ────────────────────────────────────────────────────────────────

export interface EmployeeAddress {
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

export interface CurrentAddress {
	sameAsFiscal: boolean;
	address: EmployeeAddress | null;
}

// ── Checklist Template ─────────────────────────────────────────────────────

export interface ChecklistTemplate {
	type: string;
	label: string;
	required: boolean;
	hasExpiry: boolean;
	hasRenewal: boolean;
}

// ── Query Filter ───────────────────────────────────────────────────────────

export interface EmployeeQueryFilter {
	search?: string;
	department?: string;          // key del catálogo `departments`
	position?: string;            // key del catálogo `positions`
	driverStatus?: DriverStatus;
	employmentStatus?: EmploymentStatus;
	excludeTerminated?: boolean;
}
