import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type EmployeeType =
  | 'operator'
  | 'admin';

export type EmployeePosition =
  | 'border_driver'
  | 'national_driver'
  | 'manager'
  | 'mechanic'
  | 'executive'
  | 'security_guard'
  | 'k9_inspector'
  | 'janitor'
  | 'messenger';

export type EmployeeDepartment =
  | 'operations'
  | 'maintenance'
  | 'administration'
  | 'accounting'
  | 'security'
  | 'human_resources';

export type EmploymentStatus = 'active' | 'leave' | 'terminated';
export type DriverStatus     = 'available' | 'on_trip' | 'off_duty';
export type DocumentStatus   = 'pending' | 'verified' | 'expired' | 'rejected';
export type ChecklistStatus  = 'pending' | 'complete' | 'waived';
export type DrugTestResult   = 'negative' | 'positive' | 'pending';
export type MedicalResult    = 'apto' | 'apto_con_restricciones' | 'no_apto';

export type DocumentType =
  | 'ine'
  | 'curp'
  | 'nss'
  | 'employment_contract'
  | 'internal_regulations'
  | 'employment_application'
  | 'proof_of_address'
  | 'background_check'
  | 'tax_certificate'
  | 'socioeconomic_study'
  | 'federal_license'
  | 'state_license'
  | 'sct_medical_exam'
  | 'company_medical_exam'
  | 'drug_test_mx'
  | 'drug_test_us'
  | 'dot_physical'
  | 'passport'
  | 'visa'
  | 'fast_card'
  | 'mvr_report'
  | 'psp_report'
  | 'technical_certification'
  | 'other';

// ── Subdocumentos — Emergency Contact ─────────────────────────────────────

export interface EmergencyContact {
  _id:          ObjectId;
  name:         string;
  relationship: string;
  phone:        string;
  phoneCode:    '+52' | '+1';
}

// ── Subdocumentos — Bank Account ──────────────────────────────────────────

export interface BankAccount {
  _id:           ObjectId;
  bankName:      string;
  accountNumber: string;   // AES-256 encrypted
  clabe:         string;   // AES-256 encrypted
  lastFour:      string;   // últimos 4 dígitos, sin encriptar
  documentUrl:   string | null;
  isDefault:     boolean;
  createdAt:     Date;
}

// ── Subdocumentos — Driver Documents ──────────────────────────────────────

export interface DriverLicense {
  _id:       ObjectId;
  type:      'federal' | 'estatal' | 'utilitaria';
  number:    string;
  class:     'A' | 'B' | 'C' | 'D' | 'E';
  issuedAt:  Date;
  expiresAt: Date;
  state:     string | null;
  fileUrl:   string | null;
  alertDays: number;
}

export interface MedicalExam {
  number:       string;
  issuedAt:     Date;
  expiresAt:    Date;
  result:       MedicalResult;
  restrictions: string | null;
  issuedBy:     string;
  licenseNumber: string;
  fileUrl:      string | null;
  alertDays:    number;
}

export interface DrugTest {
  date:       Date;
  result:     DrugTestResult;
  laboratory: string;
  fileUrl:    string | null;
  alertDays:  number;
}

export interface Passport {
  number:    string;
  issuedAt:  Date;
  expiresAt: Date;
  country:   string;
  fileUrl:   string | null;
  alertDays: number;
}

export interface Visa {
  type:      'B1/B2' | 'FM3' | 'other';
  number:    string;
  issuedAt:  Date;
  expiresAt: Date;
  fileUrl:   string | null;
  alertDays: number;
}

export interface FastCard {
  number:    string;
  issuedAt:  Date;
  expiresAt: Date;
  fileUrl:   string | null;
  alertDays: number;
}

export interface FmcsaDotPhysical {
  issuedAt:  Date;
  expiresAt: Date;
  issuedBy:  string;
  fileUrl:   string | null;
  alertDays: number;
}

export interface FmcsaReport {
  date:    Date;
  fileUrl: string | null;
}

export interface FmcsaAlcoholTest {
  date:       Date;
  result:     DrugTestResult;
  laboratory: string;
  fileUrl:    string | null;
}

export interface FmcsaDrugTest {
  date:       Date;
  result:     DrugTestResult;
  laboratory: string;
  fileUrl:    string | null;
  alertDays:  number;
}

export interface Fmcsa {
  cdlNumber:   string | null;
  dotPhysical: FmcsaDotPhysical | null;
  drugTest:    FmcsaDrugTest | null;
  alcoholTest: FmcsaAlcoholTest | null;
  mvrReport:   FmcsaReport | null;
  pspReport:   FmcsaReport | null;
}

// ── Subdocumentos — Vehicle Operator ──────────────────────────────────────

export interface VehicleOperator {
  isOperator:    boolean;
  driverStatus:  DriverStatus | null;
  currentUnitId: ObjectId | null;
  licenses:      DriverLicense[];
  medicalExam:   MedicalExam | null;
  drugTestMx:    DrugTest | null;
  passport:      Passport | null;
  visa:          Visa | null;
  fastCard:      FastCard | null;
  fmcsa:         Fmcsa | null;
}

// ── Subdocumentos — Documents ──────────────────────────────────────────────

export interface DocumentVersion {
  fileUrl:    string;
  uploadedAt: Date;
  replacedBy: ObjectId;
}

export interface EmployeeDocument {
  _id:              ObjectId;
  type:             DocumentType;
  name:             string;
  fileUrl:          string;
  fileSize:         number;
  mimeType:         string;
  issuedAt:         Date | null;
  expiresAt:        Date | null;
  alertDays:        number;
  verifiedAt:       Date | null;
  verifiedBy:       ObjectId | null;
  status:           DocumentStatus;
  notes:            string | null;
  uploadedAt:       Date;
  previousVersions: DocumentVersion[];
}

// ── Subdocumentos — Checklist ──────────────────────────────────────────────

export interface ChecklistItem {
  _id:          ObjectId;
  type:         string;
  label:        string;
  required:     boolean;
  status:       ChecklistStatus;
  documentId:   ObjectId | null;
  waivedBy:     ObjectId | null;
  waivedAt:     Date | null;
  waivedReason: string | null;
}

// ── Subdocumentos — Audit Log ──────────────────────────────────────────────

export interface AuditLogEntry {
  _id:       ObjectId;
  field:     string;
  oldValue:  unknown;
  newValue:  unknown;
  changedBy: ObjectId;
  changedAt: Date;
  reason: string | null;
  


}

// ── Subdocumento — Current Address ────────────────────────────────────────

export interface CurrentAddress {
  sameAsFiscal: boolean;
  address:      EmployeeAddress | null;
}

// ── Employee Profile completo ──────────────────────────────────────────────

export interface EmployeeProfile {
  isEmployee:        boolean;
  employeeType:      EmployeeType | null;
  position:          EmployeePosition | null;
  department:        EmployeeDepartment | null;
  managerId:         ObjectId | null;
  dateOfHire:        Date | null;
  employmentStatus:  EmploymentStatus;
  curp:              string | null;
  rfc:               string | null;
  razonSocial:       string | null;
  regimenFiscal:     { code: string; name: string } | null;
  address: EmployeeAddress | null;
  currentAddress: CurrentAddress | null;
  emergencyContacts: EmergencyContact[];
  bankAccounts:      BankAccount[];
  vehicleOperator:   VehicleOperator | null;
  documents:         EmployeeDocument[];
  checklist:         ChecklistItem[];
  auditLog:          AuditLogEntry[];
}

// ── Address ────────────────────────────────────────────────────────────────

export interface EmployeeAddress {
  street:   string;
  numExt:   string;
  numInt:   string;
  suburb:   { name: string; code: string };
  town:     { name: string; code: string };
  state:    { name: string; code: string };
  location: { name: string; code: string };
  city:     { name: string; code: string };
  country:  { name: string; code: string };
  cp:       string;
  reference?: string;
}

// ── Checklist Templates ────────────────────────────────────────────────────

export interface ChecklistTemplate {
  type:     DocumentType;
  label:    string;
  required: boolean;
}

// ── Query Filter ───────────────────────────────────────────────────────────

export interface EmployeeQueryFilter {
  search?:           string;
  department?:       EmployeeDepartment;
  employeeType?:     EmployeeType;
  position?:         EmployeePosition;
  driverStatus?:     DriverStatus;
  employmentStatus?: EmploymentStatus;
}