import { logger } from '../../config/logger';
import {
  cacheDel,
  getOrSet,
  CacheKeys,
  CacheTTL,
} from '../../infrastructure/cache/cache.service';
import { ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors/AppError';

import {
  findRoleById,
  findRoleByName,
  findAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from './role.repository';
import type { CreateRoleDto, Role, UpdateRoleDto } from './role.types';

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

export async function registerRole(dto: CreateRoleDto): Promise<Role> {
  const existing = await findRoleByName(dto.name, dto.orgId ?? null);
  if (existing) throw new ConflictError('Role name already exists');

  const role = await createRole(dto);

  await cacheDel(CacheKeys.roleList());

  logger.info({ roleId: role.id, name: role.name }, 'Role created');

  return role;
}

export async function editRole(
  id: string,
  dto: UpdateRoleDto,
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

  return updated;
}

export async function removeRole(id: string): Promise<void> {
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
}