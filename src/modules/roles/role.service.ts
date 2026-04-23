import { logger } from '../../config/logger';
import {
  cacheDel,
  getOrSet,
  CacheKeys,
  CacheTTL,
} from '../../infrastructure/cache/cache.service';
import { ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors/AppError';
import { computeDiff } from '../../shared/utils/diff';
import { emitAuditEvent } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';

import {
  findRoleById,
  findRoleByName,
  findAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from './role.repository';
import type { CreateRoleDto, Role, UpdateRoleDto } from './role.types';

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

export async function listRoles(orgId?: string): Promise<Role[]> {
  return getOrSet(
    CacheKeys.roleList(),
    () => findAllRoles(orgId),
    CacheTTL.LONG,
  );
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

  const updated = await updateRole(id, dto);

  await Promise.all([
    cacheDel(CacheKeys.roleOne(id)),
    cacheDel(CacheKeys.roleList()),
  ]);

  logger.info({ roleId: id }, 'Role updated');

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