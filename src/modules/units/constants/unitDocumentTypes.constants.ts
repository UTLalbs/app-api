// Catálogo de tipos de documento que se pueden adjuntar a una unidad motorizada.
// Mexicanos (8) + Americanos (7). A diferencia de trailers, las unidades sí
// tienen verificación vehicular y permiso SCT (porque tienen motor y operan
// como vehículo de transporte federal).
//
// Sincronizado con `app-web/src/lib/constants/unitDocumentTypes.ts` —
// SIEMPRE cambiar en pareja.

export type UnitDocumentType =
	// Mexicanos
	| "mx_circulation_card"
	| "mx_physical_mechanical_inspection"
	| "mx_vehicle_verification"
	| "mx_sct_permit"
	| "mx_tenencia_refrendo"
	| "mx_invoice"
	| "mx_import_pedimento"
	| "mx_weights_dimensions_dictum"
	// Americanos
	| "us_title"
	| "us_registration"
	| "us_dot_inspection"
	| "us_bill_of_sale"
	| "us_irp_apportioned_plate"
	| "us_ifta_license"
	| "us_hvut_form_2290";

export type UnitDocumentCountry = "MX" | "US";

export interface UnitDocumentTypeConfig {
	code: UnitDocumentType;
	label: string;
	country: UnitDocumentCountry;
	hasExpiry: boolean;
	defaultAlertDays: number;
	fieldsToExtract: ReadonlyArray<string>;
}

const ALL_UNIT_FIELDS = [
	"vin",
	"plates_mx",
	"plates_us",
	"us_state",
	"make",
	"model",
	"modelYear",
	"manufacturer",
	"satConfigCode", // ej. T3S2 (sugerencia desde NHTSA / doc)
	"sctPermitType", // ej. TPAF02 (en permiso SCT)
	"fuelTypeCodeSAT", // ej. 02 = Diesel
	"engineNumber",
	"color",
	"issuedAt",
	"expiresAt",
	"ownerName",
	"ownerRfc",
] as const;

export const UNIT_DOCUMENT_TYPE_CONFIG: Record<UnitDocumentType, UnitDocumentTypeConfig> = {
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
			"satConfigCode",
			"color",
			"engineNumber",
			"issuedAt",
			"expiresAt",
			"ownerName",
			"ownerRfc",
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
	mx_vehicle_verification: {
		code: "mx_vehicle_verification",
		label: "Verificación vehicular (holograma)",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_mx", "issuedAt", "expiresAt"],
	},
	mx_sct_permit: {
		code: "mx_sct_permit",
		label: "Permiso SCT autotransporte federal",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 60,
		fieldsToExtract: [
			"vin",
			"plates_mx",
			"sctPermitType",
			"satConfigCode",
			"issuedAt",
			"expiresAt",
			"ownerName",
			"ownerRfc",
		],
	},
	mx_tenencia_refrendo: {
		code: "mx_tenencia_refrendo",
		label: "Tenencia / refrendo",
		country: "MX",
		hasExpiry: true,
		defaultAlertDays: 45,
		fieldsToExtract: ["plates_mx", "issuedAt", "expiresAt"],
	},
	mx_invoice: {
		code: "mx_invoice",
		label: "Factura",
		country: "MX",
		hasExpiry: false,
		defaultAlertDays: 0,
		fieldsToExtract: [
			"vin",
			"make",
			"model",
			"modelYear",
			"manufacturer",
			"engineNumber",
			"issuedAt",
			"ownerName",
			"ownerRfc",
		],
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
			"color",
			"issuedAt",
			"ownerName",
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
		fieldsToExtract: [
			"vin",
			"make",
			"model",
			"modelYear",
			"manufacturer",
			"issuedAt",
			"ownerName",
		],
	},
	us_irp_apportioned_plate: {
		code: "us_irp_apportioned_plate",
		label: "IRP apportioned plate",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "plates_us", "us_state", "issuedAt", "expiresAt"],
	},
	us_ifta_license: {
		code: "us_ifta_license",
		label: "IFTA license",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 30,
		fieldsToExtract: ["vin", "us_state", "issuedAt", "expiresAt"],
	},
	us_hvut_form_2290: {
		code: "us_hvut_form_2290",
		label: "HVUT Form 2290",
		country: "US",
		hasExpiry: true,
		defaultAlertDays: 45,
		fieldsToExtract: ["vin", "issuedAt", "expiresAt"],
	},
};

export const UNIT_DOCUMENT_TYPES: UnitDocumentType[] = Object.keys(
	UNIT_DOCUMENT_TYPE_CONFIG,
) as UnitDocumentType[];

export type UnitDocumentExtractableField = (typeof ALL_UNIT_FIELDS)[number];
