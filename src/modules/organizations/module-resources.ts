import type { Action, Resource } from "../roles/role.types";
import type { OrganizationSettings } from "./organization.types";

export type FeatureKey = keyof OrganizationSettings["features"];

export const MODULE_RESOURCES = {
	operations: ["control_board", "services"],
	fuel: ["fuel", "fuel_inventory", "fuel_scheduling"],
	maintenance: ["maintenance", "maintenance_orders", "maintenance_inventory"],
	administration: ["billing", "reports", "invoices"],
	humanResources: [
		"hr_dashboard",
		"employees",
		"time_clocks",
		"schedules",
		"hr_document_catalog",
		"hr_document_profiles",
		"hr_positions",
		"hr_departments",
	],
	payroll: ["payroll", "payroll_periods"],
	catalogs: ["users", "units", "trailers", "clients", "locations", "tax_entities"],
} as const satisfies Record<FeatureKey, readonly Resource[]>;

export const FULL_CRUD: Action[] = ["read", "create", "update", "delete"];

// ── Catálogo enriquecido por submódulo ─────────────────────────────────────
// Describe la UI de configuración de roles: etiqueta del submódulo, qué
// acciones aplican y si el submódulo soporta scope (un manager solo ve a su
// equipo, etc.). Los submódulos de configuración (catálogos globales) no
// soportan scope.

export interface SubmoduleSpec {
	label: string;
	actions: Action[];
	supportsScope: boolean;
}

export interface ModuleSpec {
	label: string;
	submodules: Partial<Record<Resource, SubmoduleSpec>>;
}

export const MODULE_CATALOG: Record<FeatureKey, ModuleSpec> = {
	operations: {
		label: "Operaciones",
		submodules: {},
	},
	fuel: {
		label: "Combustible",
		submodules: {},
	},
	maintenance: {
		label: "Mantenimiento",
		submodules: {},
	},
	administration: {
		label: "Administración",
		submodules: {},
	},
	humanResources: {
		label: "Recursos Humanos",
		submodules: {
			hr_dashboard: {
				label: "Dashboard",
				actions: ["read"],
				supportsScope: true,
			},
			employees: {
				label: "Empleados",
				actions: ["read", "create", "update", "delete"],
				supportsScope: true,
			},
			time_clocks: {
				label: "Fichajes",
				actions: ["read", "resolve", "correct", "exclude"],
				supportsScope: true,
			},
			schedules: {
				label: "Programación",
				actions: ["read", "edit_shifts"],
				supportsScope: true,
			},
			hr_document_catalog: {
				label: "Catálogo de documentos",
				actions: ["read", "create", "update"],
				supportsScope: false,
			},
			hr_document_profiles: {
				label: "Perfiles de expediente",
				actions: ["read", "create", "update"],
				supportsScope: false,
			},
			hr_positions: {
				label: "Puestos",
				actions: ["read", "create", "update"],
				supportsScope: false,
			},
			hr_departments: {
				label: "Departamentos",
				actions: ["read", "create", "update"],
				supportsScope: false,
			},
		},
	},
	payroll: {
		label: "Nóminas",
		submodules: {},
	},
	catalogs: {
		label: "Catálogos",
		submodules: {},
	},
};
