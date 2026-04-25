import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';
import {
  cacheDel,
  getOrSet,
  CacheKeys,
  CacheTTL,
} from '../../infrastructure/cache/cache.service';
import { invalidatePermissionsCache } from '../../middleware/authorize';
import { ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors/AppError';
import { computeDiff } from '../../shared/utils/diff';
import { emitAuditEvent } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { getUserCollection } from '../users/user.model';

import {
  findRoleById,
  findRoleByName,
  findAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from './role.repository';
import type { CreateRoleDto, Role, UpdateRoleDto } from './role.types';

// Encuentra todos los usuarios que tienen el role dado y limpia sus caches de
// permisos/usuario en Redis. Evita que la edición de un rol quede invisible
// para los usuarios afectados hasta que expire el TTL (5 min).
async function invalidateUsersWithRole(roleId: string): Promise<void> {
  const users = await getUserCollection()
    .find(
      { 'roles.roleId': new ObjectId(roleId) },
      { projection: { _id: 1 } },
    )
    .toArray();
  await Promise.all(
    users.map((u) => invalidatePermissionsCache(String(u._id))),
  );
}

const ROLE_UPDATABLE_FIELDS = [
  'name',
  'description',
  'isActive',
  'permissions',
] as const satisfies readonly (keyof UpdateRoleDto)[];

export async function getRoleById(id: string): Promise<Role> {
  const role = await getOrSet(
    CacheKeys.roleOne(id),
    () => findRoleById(id),
    CacheTTL.LONG,
  );

  if (!role) throw new NotFoundError('Role');

  return role;
}

export async function listRoles(
  orgId?: string,
  callerUserType?: string,
): Promise<Role[]> {
  const all = await getOrSet(
    CacheKeys.roleList(),
    () => findAllRoles(orgId),
    CacheTTL.LONG,
  );
  // El cache guarda la lista completa (incluye super_admin). Filtramos
  // post-read según el caller para no fragmentar el cache.
  if (callerUserType === 'super_admin') return all;
  return all.filter((r) => !(r.isSystem && r.orgId === null));
}

export async function registerRole(
  dto: CreateRoleDto,
  context: AuditContext,
): Promise<Role> {
  const existing = await findRoleByName(dto.name, dto.orgId ?? null);
  if (existing) throw new ConflictError('Role name already exists');

  const role = await createRole(dto);

  await cacheDel(CacheKeys.roleList());

  logger.info({ roleId: role.id, name: role.name }, 'Role created');

  await emitAuditEvent({
    category: 'roles',
    action: 'role_created',
    target: { type: 'role', id: role.id, displayName: role.name },
    metadata: { permissions: role.permissions.length },
    context,
  });

  return role;
}

export async function editRole(
  id: string,
  dto: UpdateRoleDto,
  context: AuditContext,
): Promise<Role> {
  const existing = await findRoleById(id);
  if (!existing) throw new NotFoundError('Role');

  // Roles del sistema no se pueden modificar
  if (existing.isSystem) {
    throw new ForbiddenError('System roles cannot be modified');
  }

  // El admin por organización se sincroniza desde los módulos habilitados
  if (existing.isOrgAdmin) {
    throw new ForbiddenError('Admin role cannot be modified directly');
  }

  const updated = await updateRole(id, dto);

  await Promise.all([
    cacheDel(CacheKeys.roleOne(id)),
    cacheDel(CacheKeys.roleList()),
    invalidateUsersWithRole(id),
  ]);

  logger.info({ roleId: id }, 'Role updated');

  // El diff de `permissions` se computa sobre el array completo. Como `scope`
  // es ahora parte de cada `Permission`, cualquier cambio de scope queda
  // reflejado dentro del diff de `permissions` sin necesidad de tracking
  // adicional.
  const diff = computeDiff<UpdateRoleDto>(
    existing as unknown as Partial<UpdateRoleDto>,
    updated as unknown as Partial<UpdateRoleDto>,
    { allowedFields: ROLE_UPDATABLE_FIELDS },
  );

  await emitAuditEvent({
    category: 'roles',
    action: dto.permissions !== undefined ? 'role_permissions_changed' : 'role_updated',
    target: { type: 'role', id, displayName: updated.name },
    diff: diff ?? undefined,
    context,
  });

  return updated;
}

export async function removeRole(
  id: string,
  context: AuditContext,
): Promise<void> {
  const existing = await findRoleById(id);
  if (!existing) throw new NotFoundError('Role');

  if (existing.isSystem) {
    throw new ForbiddenError('System roles cannot be deleted');
  }

  if (existing.isOrgAdmin) {
    throw new ForbiddenError('Admin role cannot be deleted');
  }

  await invalidateUsersWithRole(id);
  await deleteRole(id);

  await Promise.all([
    cacheDel(CacheKeys.roleOne(id)),
    cacheDel(CacheKeys.roleList()),
  ]);

  logger.info({ roleId: id }, 'Role removed');

  await emitAuditEvent({
    category: 'roles',
    action: 'role_deleted',
    target: { type: 'role', id, displayName: existing.name },
    context,
  });
}