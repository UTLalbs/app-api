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
const READ_WRITE: Action[] = ["read", "create", "update"];

function p(resource: Resource, actions: Action[]): Permission {
	return {resource, actions};
}

// ── Único rol del sistema ─────────────────────────────────────────────────
//
// El modelo de roles del SaaS es:
//   • super_admin → administrador del sistema (este seed). Tiene userType
//     'super_admin' y bypassa authorize a nivel middleware.
//   • admin per-org → se crea automáticamente al crear cada org
//     (`ensureOrgAdminRole`). Refleja los módulos habilitados.
//   • Cualquier otro rol lo crea el admin de la org desde Settings → Roles.

const SYSTEM_ROLES: Omit<RoleDocument, "_id" | "createdAt" | "updatedAt">[] = [
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
			p("hr_dashboard", ["read"]),
			p("employees", ALL_ACTIONS),
			p("time_clocks", ["read", "resolve", "correct", "exclude"]),
			p("schedules", ["read", "edit_shifts"]),
			p("hr_document_catalog", READ_WRITE),
			p("hr_document_profiles", READ_WRITE),
			p("hr_positions", READ_WRITE),
			p("hr_departments", READ_WRITE),
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
