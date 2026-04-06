import type {ChecklistItem} from "./employee.types";

// ── Template único para todos los empleados ────────────────────────────────

export interface ChecklistTemplate {
	type: string;
	label: string;
	required: boolean;
	hasExpiry: boolean;
	hasRenewal: boolean;
}

export const EMPLOYEE_CHECKLIST_TEMPLATE: ChecklistTemplate[] = [
	{
		type: "ine",
		label: "INE",
		required: true,
		hasExpiry: false,
		hasRenewal: false,
	},
	{
		type: "curp",
		label: "CURP",
		required: true,
		hasExpiry: false,
		hasRenewal: false,
	},
	{
		type: "employment_contract",
		label: "Contrato de trabajo",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "internal_regulations",
		label: "Reglamento interno",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "employment_application",
		label: "Solicitud de empleo",
		required: false,
		hasExpiry: false,
		hasRenewal: false,
	},
	{
		type: "proof_of_address",
		label: "Comprobante de domicilio",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "tax_certificate",
		label: "Constancia fiscal SAT",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "background_check",
		label: "Carta de no antecedentes",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "socioeconomic_study",
		label: "Estudio socioeconómico",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "company_medical_exam",
		label: "Examen médico empresa",
		required: true,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		type: "sct_medical_exam",
		label: "Examen médico SCT",
		required: false,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		type: "drug_test_mx",
		label: "Antidoping",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "dot_physical",
		label: "DOT Physical (FMCSA)",
		required: false,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		type: "drug_test_us",
		label: "Antidoping (FMCSA)",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "federal_license",
		label: "Licencia federal",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "state_license",
		label: "Licencia estatal",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "passport",
		label: "Pasaporte",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "visa",
		label: "Visa",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "customs_badge",
		label: "Gafete Aduana Americana",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "fast_card",
		label: "FAST Card",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		type: "mvr_report",
		label: "MVR Report",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "psp_report",
		label: "PSP Report",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		type: "bank_account",
		label: "Carátula estado de cuenta",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
];

// ── Generar checklist completo desde template ──────────────────────────────

export function buildChecklist(): Omit<ChecklistItem, "_id">[] {
	return EMPLOYEE_CHECKLIST_TEMPLATE.map((t) => ({
		type: t.type,
		label: t.label,
		required: t.required,
		status: "pending",
		documentId: null,
		hasExpiry: t.hasExpiry,
		alertDays: null,
		hasRenewal: t.hasRenewal,
		renewalMonths: null,
		lastRenewedAt: null,
		waivedBy: null,
		waivedAt: null,
		waivedReason: null,
		waivedNote: null,
	}));
}
