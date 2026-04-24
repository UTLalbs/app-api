import {logger} from "../../config/logger";

import {getRoleCollection} from "./role.model";
import type {Action, Permission, Resource, RoleDocument} from "./role.types";

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_ACTIONS: Action[] = [
	"read",
	"create",
	"update",
	"delete",
	"cancel",
	"export",
	"resolve",
];
const READ_ONLY: Action[] = ["read"];
const READ_WRITE: Action[] = ["read", "create", "update"];
const FULL_CRUD: Action[] = ["read", "create", "update", "delete"];

function p(resource: Resource, actions: Action[]): Permission {
	return {resource, actions};
}

// ── Roles del sistema ──────────────────────────────────────────────────────

const SYSTEM_ROLES: Omit<RoleDocument, "_id" | "createdAt" | "updatedAt">[] = [
	// ── Super Admin ──────────────────────────────────────────────────────────
	{
		name: "super_admin",
		description: "Dueño del SaaS — acceso total a todos los tenants",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("control_board", ALL_ACTIONS),
			p("services", ALL_ACTIONS),
			p("fuel", ALL_ACTIONS),
			p("fuel_inventory", ALL_ACTIONS),
			p("fuel_scheduling", ALL_ACTIONS),
			p("maintenance", ALL_ACTIONS),
			p("maintenance_orders", ALL_ACTIONS),
			p("maintenance_inventory", ALL_ACTIONS),
			p("billing", ALL_ACTIONS),
			p("reports", ALL_ACTIONS),
			p("invoices", ALL_ACTIONS),
			p("payroll", ALL_ACTIONS),
			p("employees", ALL_ACTIONS),
			p("payroll_periods", ALL_ACTIONS),
			p("users", ALL_ACTIONS),
			p("units", ALL_ACTIONS),
			p("trailers", ALL_ACTIONS),
			p("clients", ALL_ACTIONS),
			p("locations", ALL_ACTIONS),
			p("tax_entities", ALL_ACTIONS),
			p("settings", ALL_ACTIONS),
			p("audit", ALL_ACTIONS),
		],
	},

	// ── Org Admin ────────────────────────────────────────────────────────────
	{
		name: "org_admin",
		description:
			"Administrador del tenant — acceso total dentro de su organización",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("control_board", READ_ONLY),
			p("services", ALL_ACTIONS),
			p("fuel", READ_ONLY),
			p("fuel_inventory", READ_WRITE),
			p("fuel_scheduling", FULL_CRUD),
			p("maintenance", READ_ONLY),
			p("maintenance_orders", ALL_ACTIONS),
			p("maintenance_inventory", READ_WRITE),
			p("billing", READ_WRITE),
			p("reports", ["read", "export"]),
			p("invoices", ALL_ACTIONS),
			p("payroll", READ_ONLY),
			p("employees", FULL_CRUD),
			p("payroll_periods", FULL_CRUD),
			p("users", FULL_CRUD),
			p("units", FULL_CRUD),
			p("trailers", FULL_CRUD),
			p("clients", FULL_CRUD),
			p("locations", FULL_CRUD),
			p("tax_entities", FULL_CRUD),
			p("settings", ["read", "update"]),
			p("audit", READ_ONLY),
		],
	},

	// ── Dispatcher ───────────────────────────────────────────────────────────
	{
		name: "dispatcher",
		description: "Coordinador de viajes — gestión de servicios y tablero",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("control_board", READ_ONLY),
			p("services", ["read", "create", "update", "cancel"]),
			p("units", READ_ONLY),
			p("trailers", READ_ONLY),
			p("clients", READ_ONLY),
			p("locations", READ_ONLY),
			p("reports", READ_ONLY),
			p("employees", ALL_ACTIONS),
		],
	},

	// ── Driver ───────────────────────────────────────────────────────────────
	{
		name: "driver",
		description: "Operador / Chofer — sus servicios desde app móvil",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("services", ["read", "update"]),
			p("control_board", READ_ONLY),
		],
	},

	// ── Mechanic ─────────────────────────────────────────────────────────────
	{
		name: "mechanic",
		description: "Mecánico — mantenimiento, inventario y unidades",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("maintenance", READ_ONLY),
			p("maintenance_orders", ["read", "create", "update", "resolve"]),
			p("maintenance_inventory", READ_WRITE),
			p("units", READ_ONLY),
			p("trailers", READ_ONLY),
			p("fuel", READ_ONLY),
			p("reports", READ_ONLY),
		],
	},

	// ── Accountant ───────────────────────────────────────────────────────────
	{
		name: "accountant",
		description: "Contador — facturación, facturas y reportes",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("billing", READ_WRITE),
			p("invoices", ["read", "create", "update", "cancel"]),
			p("reports", ["read", "export"]),
			p("clients", READ_ONLY),
			p("tax_entities", READ_ONLY),
			p("employees", ALL_ACTIONS),
		],
	},

	// ── HR ───────────────────────────────────────────────────────────────────
	{
		name: "hr",
		description: "Recursos Humanos — empleados, nóminas y períodos",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("payroll", READ_ONLY),
			p("employees", FULL_CRUD),
			p("payroll_periods", FULL_CRUD),
			p("users", READ_ONLY),
			p("reports", READ_ONLY),
		],
	},

	// ── Manager ──────────────────────────────────────────────────────────────
	{
		name: "manager",
		description: "Gerente — solo lectura de reportes y KPIs",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("control_board", READ_ONLY),
			p("services", READ_ONLY),
			p("fuel", READ_ONLY),
			p("maintenance", READ_ONLY),
			p("billing", READ_ONLY),
			p("reports", ["read", "export"]),
			p("invoices", READ_ONLY),
			p("payroll", READ_ONLY),
			p("units", READ_ONLY),
			p("trailers", READ_ONLY),
			p("clients", READ_ONLY),
			p("employees", ALL_ACTIONS),
		],
	},

	// ── Fuel Manager ─────────────────────────────────────────────────────────
	{
		name: "fuel_manager",
		description:
			"Jefe de Combustible — inventario y programación de combustible",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("fuel", READ_ONLY),
			p("fuel_inventory", READ_WRITE),
			p("fuel_scheduling", FULL_CRUD),
			p("units", READ_ONLY),
			p("reports", READ_ONLY),
			p("employees", ALL_ACTIONS),
		],
	},

	// ── Client Viewer ────────────────────────────────────────────────────────
	{
		name: "client_viewer",
		description: "Contacto cliente — portal externo, solo sus datos",
		orgId: null,
		isSystem: true,
		isOrgAdmin: false,
		isActive: true,
		permissions: [
			p("services", READ_ONLY),
			p("invoices", ["read", "export"]),
			p("reports", READ_ONLY),
		],
	},
];

// ── Función de seed ───────────────────────────────────────────────────────

export async function seedRoles(): Promise<void> {
	const collection = getRoleCollection();
	const now = new Date();

	let created = 0;
	let updated = 0;

	for (const role of SYSTEM_ROLES) {
		const result = await collection.updateOne(
			{name: role.name, isSystem: true},
			{
				$set: {
					...role,
					updatedAt: now,
				},
				$setOnInsert: {
					createdAt: now,
				},
			},
			{upsert: true},
		);

		if (result.upsertedCount > 0) created++;
		else if (result.modifiedCount > 0) updated++;
	}

	logger.info(
		{created, updated, total: SYSTEM_ROLES.length},
		"✅  Role seed complete",
	);
}
