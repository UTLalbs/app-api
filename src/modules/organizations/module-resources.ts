import type { Action, Resource } from "../roles/role.types";
import type { OrganizationSettings } from "./organization.types";

export type FeatureKey = keyof OrganizationSettings["features"];

export const MODULE_RESOURCES = {
	operations: ["control_board", "services"],
	fuel: ["fuel", "fuel_inventory", "fuel_scheduling"],
	maintenance: ["maintenance", "maintenance_orders", "maintenance_inventory"],
	administration: ["billing", "reports", "invoices"],
	humanResources: ["employees"],
	payroll: ["payroll", "payroll_periods"],
	catalogs: ["users", "units", "trailers", "clients", "locations", "tax_entities"],
} as const satisfies Record<FeatureKey, readonly Resource[]>;

export const FULL_CRUD: Action[] = ["read", "create", "update", "delete"];
