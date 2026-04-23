import {logger} from "../../config/logger";
import {
	cacheDel,
	getOrSet,
	CacheKeys,
	CacheTTL,
} from "../../infrastructure/cache/cache.service";
import {invalidatePermissionsCache} from "../../middleware/authorize";
import {NotFoundError, ForbiddenError} from "../../shared/errors/AppError";
import {computeDiff} from "../../shared/utils/diff";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";


import {
	findUserById,
	findUserByEmail,
	findAllUsers,
	createUser,
	updateUser,
  softDeleteUser,
} from "./user.repository";
import type {
	CreateUserDto,
	UpdateUserDto,
	User,
  UserStatus,
  UserQueryFilter
} from "./user.types";

// Campos del UpdateUserDto que se permite comparar en el diff (excluye audit ruido).
const USER_UPDATABLE_FIELDS = [
  'displayName',
  'firstName',
  'lastName',
  'isGroup',
  'groupAlias',
  'phones',
  'status',
  'roles',
  'clientId',
  'preferences',
  'employeeProfile',
  'clientMemberships',
] as const satisfies readonly (keyof UpdateUserDto)[];

// ── Consultas ──────────────────────────────────────────────────────────────

export async function getUserById(id: string, orgId: string): Promise<User> {
  const user = await getOrSet(
    CacheKeys.userOne(id),
    () => findUserById(id, orgId),
    CacheTTL.MEDIUM,
  );

  if (!user) throw new NotFoundError('User');

  return user;
}

// Lectura desde un handler HTTP — emite `user_read` cuando el actor no es el
// propio usuario consultado (evitamos ensuciar el log con self-reads del "me"
// o del refresh de perfil del propio actor).
export async function readUserDetail(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<User> {
  const user = await getUserById(id, orgId);

  if (context.actor && context.actor.id !== id) {
    await emitAuditEvent({
      category: 'users',
      action: 'user_read',
      target: { type: 'user', id, displayName: user.displayName },
      context,
    });
  }

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return findUserByEmail(email);
}

export async function listUsers(
  filter: UserQueryFilter,
  accessFilter: Record<string, unknown>,
): Promise<{ users: User[]; total: number }> {
  // Cache solo cuando hay orgId y sin filtros adicionales
  const orgId = accessFilter.orgId as string | undefined;

  if (orgId && Object.keys(filter).length === 0) {
    const cached = await getOrSet(
      CacheKeys.userList(orgId.toString()),
      () => findAllUsers(filter, accessFilter),
      CacheTTL.SHORT,
    );
    return cached;
  }

  return findAllUsers(filter, accessFilter);
}

// ── Creación ───────────────────────────────────────────────────────────────

export async function registerUser(
  dto: CreateUserDto,
  context: AuditContext,
): Promise<User> {
  const existing = await findUserByEmail(dto.email);

  if (existing) {
    throw new ForbiddenError('Email is already registered');
  }

  const user = await createUser(dto);

  // Invalidar lista para que el próximo request la recargue
  await cacheDel(CacheKeys.userList(dto.orgId));

  logger.info({ userId: user.id, orgId: dto.orgId }, 'User registered');

  await emitAuditEvent({
    category: 'users',
    action: 'user_created',
    target: { type: 'user', id: user.id, displayName: user.displayName },
    metadata: { email: user.email, userType: user.userType },
    context,
  });

  return user;
}

// ── Actualización ──────────────────────────────────────────────────────────

export async function editUser(
  id: string,
  orgId: string,
  dto: UpdateUserDto,
  context: AuditContext,
): Promise<User> {
  const existing = await findUserById(id, orgId);
  if (!existing) throw new NotFoundError('User');

  const updated = await updateUser(id, orgId, dto);

  // Invalidar cache del usuario y de la lista
  await Promise.all([
    cacheDel(CacheKeys.userOne(id)),
    cacheDel(CacheKeys.userList(orgId)),
    dto.roles ? invalidatePermissionsCache(id) : Promise.resolve(),
  ]);

  logger.info({ userId: id }, 'User updated');

  const diff = computeDiff<UpdateUserDto>(
    existing as unknown as Partial<UpdateUserDto>,
    updated as unknown as Partial<UpdateUserDto>,
    { allowedFields: USER_UPDATABLE_FIELDS },
  );

  await emitAuditEvent({
    category: 'users',
    action: dto.roles ? 'user_role_assigned' : 'user_updated',
    target: { type: 'user', id, displayName: updated.displayName },
    diff: diff ?? undefined,
    context,
  });

  return updated;
}

export async function changeUserStatus(
  id: string,
  orgId: string,
  status: UserStatus,
  context: AuditContext,
): Promise<User> {
  const actorId = context.actor?.id;
  if (actorId && id === actorId) {
    throw new ForbiddenError('Cannot change your own account status');
  }

  const existing = await findUserById(id, orgId);
  if (!existing) throw new NotFoundError('User');

  const updated = await updateUser(id, orgId, { status });

  await Promise.all([
    cacheDel(CacheKeys.userOne(id)),
    cacheDel(CacheKeys.userList(orgId)),
    invalidatePermissionsCache(id),
  ]);

  logger.info({ userId: id, status, actorId }, 'User status changed');

  await emitAuditEvent({
    category: 'users',
    action: 'user_status_changed',
    target: { type: 'user', id, displayName: updated.displayName },
    diff: { status: { old: existing.status, new: status } },
    context,
  });

  return updated;
}

// ── Eliminación ────────────────────────────────────────────────────────────

export async function removeUser(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<void> {
  const actorId = context.actor?.id;
  if (actorId && id === actorId) {
    throw new ForbiddenError('Cannot delete your own account');
  }

  const existing = await findUserById(id, orgId);
  if (!existing) throw new NotFoundError('User');

  await softDeleteUser(id, orgId);

  await Promise.all([
    cacheDel(CacheKeys.userOne(id)),
    cacheDel(CacheKeys.userList(orgId)),
    invalidatePermissionsCache(id),
  ]);

  logger.info({ userId: id, actorId }, 'User removed');

  await emitAuditEvent({
    category: 'users',
    action: 'user_deleted',
    target: { type: 'user', id, displayName: existing.displayName },
    context,
  });
}