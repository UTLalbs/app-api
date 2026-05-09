// Catálogo de tipos de documento que se pueden adjuntar a un remolque.
// Mexicanos (5) + Americanos (6). La verificación vehicular NO aplica a
// remolques porque no tienen motor de combustión.

export type TrailerDocumentType =
	// Mexicanos
	| "mx_circulation_card"
	| "mx_physical_mechanical_inspection"
	| "mx_invoice"
	| "mx_import_pedimento"
	| "mx_weights_dimensions_dictum"
	// Americanos
	| "us_title"
	| "us_registration"
	| "us_dot_inspection"
	| "us_bill_of_sale"
	| "us_irp_apportioned_plate"
	| "us_hvut_form_2290";

export type TrailerDocumentCountry = "MX" | "US";

export interface TrailerDocumentTypeConfig {
	code: TrailerDocumentType;
	label: string;
	country: TrailerDocumentCountry;
	hasExpiry: boolean;
	defaultAlertDays: number; // días antes del vencimiento para crear alerta
	/** Campos que esperamos extraer del PDF para autollenar / persistir. */
	fieldsToExtract: ReadonlyArray<string>;
}

const ALL_TRAILER_FIELDS = [
	"vin",
	"plates_mx",
	"plates_us",
	"us_state",
	"make",
	"model",
	"modelYear",
	"manufacturer",
	"ctrSubtype", // sugerencia
	"issuedAt",
	"expiresAt",
] as const;

export const TRAILER_DOCUMENT_TYPE_CONFIG: Record<
	TrailerDocumentType,
	TrailerDocumentTypeConfig
> = {
	// ── México ─────────────────────────────────────────────────────────────
	mx_circulation_card: {
		code: "mx_circulation_card",
		label: "Tarjeta de circulación",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: [
			"vin",
			"plates_mx",
			"make",
			"model",
			"modelYear",
			"manufacturer",
			"ctrSubtype",
			"issuedAt",
			"expiresAt",
		],
	},
	mx_physical_mechanical_inspection: {
		code: "mx_physical_mechanical_inspection",
		label: "Inspección físico-mecánica (NOM-068)",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_mx", "issuedAt", "expiresAt"],
	},
	mx_invoice: {
		code: "mx_invoice",
		label: "Factura",
		country: "MX",
		hasExpiry: false,
		defaultAlertDays: 0,
		fieldsToExtract: ["vin", "make", "model", "modelYear", "manufacturer", "issuedAt"],
	},
	mx_import_pedimento: {
		code: "mx_import_pedimento",
		label: "Pedimento de importación",
		country: "MX",
		hasExpiry: false,
		defaultAlertDays: 0,
		fieldsToExtract: ["vin", "issuedAt"],
	},
	mx_weights_dimensions_dictum: {
		code: "mx_weights_dimensions_dictum",
		label: "Dictamen de pesos y dimensiones (NOM-012)",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_mx", "issuedAt", "expiresAt"],
	},
	// ── Estados Unidos ─────────────────────────────────────────────────────
	us_title: {
		code: "us_title",
		label: "Title (título de propiedad)",
		country: "US",
		hasExpiry: false,
		defaultAlertDays: 0,
		fieldsToExtract: [
			"vin",
			"make",
			"model",
			"modelYear",
			"manufacturer",
			"us_state",
			"issuedAt",
		],
	},
	us_registration: {
		code: "us_registration",
		label: "Registration / cab card",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: [
			"vin",
			"plates_us",
			"us_state",
			"make",
			"modelYear",
			"issuedAt",
			"expiresAt",
		],
	},
	us_dot_inspection: {
		code: "us_dot_inspection",
		label: "DOT Annual Inspection (49 CFR 396.17)",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_us", "us_state", "issuedAt", "expiresAt"],
	},
	us_bill_of_sale: {
		code: "us_bill_of_sale",
		label: "Bill of Sale",
		country: "US",
		hasExpiry: false,
		defaultAlertDays: 0,
		fieldsToExtract: ["vin", "make", "model", "modelYear", "manufacturer", "issuedAt"],
	},
	us_irp_apportioned_plate: {
		code: "us_irp_apportioned_plate",
		label: "IRP apportioned plate",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_us", "us_state", "issuedAt", "expiresAt"],
	},
	us_hvut_form_2290: {
		code: "us_hvut_form_2290",
		label: "HVUT Form 2290",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 45, // tax year, alerta más amplia
		fieldsToExtract: ["vin", "issuedAt", "expiresAt"],
	},
};

export const TRAILER_DOCUMENT_TYPES: TrailerDocumentType[] = Object.keys(
	TRAILER_DOCUMENT_TYPE_CONFIG,
) as TrailerDocumentType[];

export type TrailerDocumentExtractableField = (typeof ALL_TRAILER_FIELDS)[number];
