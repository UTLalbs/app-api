import { ObjectId } from "mongodb";

import { logger } from "../../config/logger";
import {
  cacheDel,
  CacheKeys,
} from "../../infrastructure/cache/cache.service";
import {
  FULL_CRUD,
  MODULE_CATALOG,
  MODULE_RESOURCES,
  type FeatureKey,
} from "../organizations/module-resources";
import type { OrganizationSettings } from "../organizations/organization.types";

import { getRoleCollection } from "./role.model";
import type { Action, Permission, RoleDocument } from "./role.types";

function buildAdminPermissions(
  features: OrganizationSettings["features"],
): Permission[] {
  const permissions: Permission[] = [];

  (Object.keys(MODULE_RESOURCES) as FeatureKey[]).forEach((feature) => {
    if (!features[feature]) return;
    for (const resource of MODULE_RESOURCES[feature]) {
      // Combina FULL_CRUD con cualquier acción específica declarada en el
      // catálogo (ej. 'approve' para absences, 'edit_shifts' para schedules).
      const catalogActions =
        MODULE_CATALOG[feature]?.submodules[resource]?.actions ?? [];
      const merged = new Set<Action>([...FULL_CRUD, ...catalogActions]);
      permissions.push({ resource, actions: [...merged] });
    }
  });

  // Los admins siempre pueden leer/editar ajustes y ver audit log
  permissions.push({ resource: "settings", actions: ["read", "update"] });
  permissions.push({ resource: "audit", actions: ["read"] });

  return permissions;
}

export async function ensureOrgAdminRole(
  orgId: string,
  features: OrganizationSettings["features"],
): Promise<void> {
  if (!ObjectId.isValid(orgId)) return;

  const orgObjectId = new ObjectId(orgId);
  const now = new Date();
  const permissions = buildAdminPermissions(features);

  const result = await getRoleCollection().findOneAndUpdate(
    { orgId: orgObjectId, isOrgAdmin: true },
    {
      $set: {
        name: "admin",
        description:
          "Administrador de la organización — acceso a todos los módulos habilitados",
        orgId: orgObjectId,
        isSystem: false,
        isOrgAdmin: true,
        isActive: true,
        permissions,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const doc = result as RoleDocument | null;
  if (doc?._id) {
    await cacheDel(CacheKeys.roleOne(doc._id.toHexString()));
  }
  await cacheDel(CacheKeys.roleList());

  logger.info(
    { orgId, permissionCount: permissions.length },
    "Admin role synced for organization",
  );
}
