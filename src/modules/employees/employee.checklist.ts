import type {
	ChecklistTemplate,
	EmployeePosition,
	EmployeeType,
} from "./employee.types";

// ── Templates ──────────────────────────────────────────────────────────────

export const OPERATOR_BORDER_TEMPLATE: ChecklistTemplate[] = [
	{type: "ine", label: "INE", required: true},
	{type: "curp", label: "CURP", required: true},
	{type: "nss", label: "NSS", required: false},
	{type: "employment_contract", label: "Contrato firmado", required: true},
	{
		type: "internal_regulations",
		label: "Reglamento interno firmado",
		required: true,
	},
	{
		type: "employment_application",
		label: "Solicitud de empleo",
		required: true,
	},
	{type: "proof_of_address", label: "Comprobante de domicilio", required: true},
	{
		type: "background_check",
		label: "Carta de no antecedentes penales",
		required: true,
	},
	{
		type: "socioeconomic_study",
		label: "Estudio socioeconómico",
		required: true,
	},
	{type: "tax_certificate", label: "Constancia fiscal SAT", required: true},
	{
		type: "bank_account",
		label: "Carátula de estado de cuenta bancaria",
		required: true,
	},
	{
		type: "federal_license",
		label: "Licencia federal de conducir",
		required: true,
	},
	{type: "state_license", label: "Licencia estatal", required: false},
	{type: "sct_medical_exam", label: "Examen médico SCT", required: true},
	{
		type: "company_medical_exam",
		label: "Examen médico empresa",
		required: true,
	},
	{type: "drug_test_mx", label: "Drug Test (México)", required: true},
	{type: "visa", label: "Visa B1/B2", required: true},
	{type: "passport", label: "Pasaporte", required: false},
	{type: "fast_card", label: "FAST Card", required: false},
	{type: "dot_physical", label: "DOT Physical (FMCSA)", required: false},
	{type: "drug_test_us", label: "Drug Test (FMCSA USA)", required: false},
	{type: "mvr_report", label: "MVR Report", required: false},
	{type: "psp_report", label: "PSP Report", required: false},
];

export const OPERATOR_NATIONAL_TEMPLATE: ChecklistTemplate[] = [
	{type: "ine", label: "INE", required: true},
	{type: "curp", label: "CURP", required: true},
	{type: "nss", label: "NSS", required: false},
	{type: "employment_contract", label: "Contrato firmado", required: true},
	{
		type: "internal_regulations",
		label: "Reglamento interno firmado",
		required: true,
	},
	{
		type: "employment_application",
		label: "Solicitud de empleo",
		required: true,
	},
	{type: "proof_of_address", label: "Comprobante de domicilio", required: true},
	{
		type: "background_check",
		label: "Carta de no antecedentes penales",
		required: true,
	},
	{
		type: "socioeconomic_study",
		label: "Estudio socioeconómico",
		required: true,
	},
	{type: "tax_certificate", label: "Constancia fiscal SAT", required: true},
	{
		type: "bank_account",
		label: "Carátula de estado de cuenta bancaria",
		required: true,
	},
	{
		type: "federal_license",
		label: "Licencia federal de conducir",
		required: true,
	},
	{type: "state_license", label: "Licencia estatal", required: false},
	{type: "sct_medical_exam", label: "Examen médico SCT", required: true},
	{
		type: "company_medical_exam",
		label: "Examen médico empresa",
		required: true,
	},
	{type: "drug_test_mx", label: "Drug Test (México)", required: true},
	{type: "dot_physical", label: "DOT Physical (FMCSA)", required: false},
	{type: "drug_test_us", label: "Drug Test (FMCSA USA)", required: false},
];

export const ADMIN_TEMPLATE: ChecklistTemplate[] = [
	{type: "ine", label: "INE", required: true},
	{type: "curp", label: "CURP", required: true},
	{type: "nss", label: "NSS", required: false},
	{type: "employment_contract", label: "Contrato firmado", required: true},
	{
		type: "internal_regulations",
		label: "Reglamento interno firmado",
		required: true,
	},
	{
		type: "employment_application",
		label: "Solicitud de empleo",
		required: true,
	},
	{type: "proof_of_address", label: "Comprobante de domicilio", required: true},
	{
		type: "background_check",
		label: "Carta de no antecedentes penales",
		required: true,
	},
	{
		type: "socioeconomic_study",
		label: "Estudio socioeconómico",
		required: true,
	},
	{type: "tax_certificate", label: "Constancia fiscal SAT", required: true},
	{
		type: "bank_account",
		label: "Carátula de estado de cuenta bancaria",
		required: true,
	},
	{
		type: "company_medical_exam",
		label: "Examen médico empresa",
		required: true,
	},
	{type: "drug_test_mx", label: "Drug Test (México)", required: true},
	{
		type: "federal_license",
		label: "Licencia federal de conducir",
		required: false,
	},
	{type: "state_license", label: "Licencia estatal", required: false},
	{type: "dot_physical", label: "DOT Physical (FMCSA)", required: false},
	{type: "drug_test_us", label: "Drug Test (FMCSA USA)", required: false},
	{
		type: "technical_certification",
		label: "Certificación técnica",
		required: false,
	},
];

// ── Factory ────────────────────────────────────────────────────────────────

export function getChecklistTemplate(
	employeeType: EmployeeType,
	position: EmployeePosition | null,
): ChecklistTemplate[] {
	if (employeeType === "operator") {
		if (position === "border_driver") {
			return OPERATOR_BORDER_TEMPLATE;
		}
		return OPERATOR_NATIONAL_TEMPLATE;
	}

	return ADMIN_TEMPLATE;
}
