import type {DocumentCatalogSeedItem} from "./document-catalog.types";

export const DOCUMENT_CATALOG_SEED: DocumentCatalogSeedItem[] = [
	// ── Identificación ────────────────────────────────────────────────────
	{
		name: "INE",
		type: "ine",
		category: "identification",
		required: true,
		hasExpiry: false,
		hasRenewal: false,
	},
	{
		name: "CURP",
		type: "curp",
		category: "identification",
		required: true,
		hasExpiry: false,
		hasRenewal: false,
	},

	// ── Contratación ──────────────────────────────────────────────────────
	{
		name: "Contrato de trabajo",
		type: "employment_contract",
		category: "hiring",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "Reglamento interno",
		type: "internal_regulations",
		category: "hiring",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "Solicitud de empleo",
		type: "employment_application",
		category: "hiring",
		required: false,
		hasExpiry: false,
		hasRenewal: false,
	},

	// ── Fiscal ────────────────────────────────────────────────────────────
	{
		name: "Comprobante de domicilio",
		type: "proof_of_address",
		category: "fiscal",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "Constancia fiscal SAT",
		type: "tax_certificate",
		category: "fiscal",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "Carta de no antecedentes",
		type: "background_check",
		category: "fiscal",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "Estudio socioeconómico",
		type: "socioeconomic_study",
		category: "fiscal",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},

	// ── Médico ────────────────────────────────────────────────────────────
	{
		name: "Examen médico empresa",
		type: "company_medical_exam",
		category: "medical",
		required: true,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		name: "Examen médico SCT",
		type: "sct_medical_exam",
		category: "medical",
		required: false,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		name: "Antidoping",
		type: "drug_test_mx",
		category: "medical",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "DOT Physical (FMCSA)",
		type: "dot_physical",
		category: "medical",
		required: false,
		hasExpiry: true,
		hasRenewal: true,
	},
	{
		name: "Antidoping (FMCSA)",
		type: "drug_test_us",
		category: "medical",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},

	// ── Licencias ─────────────────────────────────────────────────────────
	{
		name: "Licencia federal",
		type: "federal_license",
		category: "license",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		name: "Licencia estatal",
		type: "state_license",
		category: "license",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},

	// ── Bancario ──────────────────────────────────────────────────────────
	{
		name: "Carátula estado de cuenta",
		type: "bank_account",
		category: "banking",
		required: true,
		hasExpiry: false,
		hasRenewal: true,
	},

	// ── Operaciones USA ───────────────────────────────────────────────────
	{
		name: "Pasaporte",
		type: "passport",
		category: "usa_ops",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		name: "Visa",
		type: "visa",
		category: "usa_ops",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		name: "Gafete Aduana Americana",
		type: "customs_badge",
		category: "usa_ops",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		name: "FAST Card",
		type: "fast_card",
		category: "usa_ops",
		required: false,
		hasExpiry: true,
		hasRenewal: false,
	},
	{
		name: "MVR Report",
		type: "mvr_report",
		category: "usa_ops",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},
	{
		name: "PSP Report",
		type: "psp_report",
		category: "usa_ops",
		required: false,
		hasExpiry: false,
		hasRenewal: true,
	},
];
