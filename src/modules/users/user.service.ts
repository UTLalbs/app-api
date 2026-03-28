import {logger} from "../../config/logger";
import {
	cacheDel,
	getOrSet,
	CacheKeys,
	CacheTTL,
} from "../../infrastructure/cache/cache.service";
import {invalidatePermissionsCache} from "../../middleware/authorize";
import {NotFoundError, ForbiddenError} from "../../shared/errors/AppError";


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
} from "./user.types";

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

export async function getUserByEmail(email: string): Promise<User | null> {
  return findUserByEmail(email);
}

export async function listUsers(
  orgId: string,
  filter: { status?: UserStatus; userType?: string } = {},
): Promise<User[]> {
  // Solo cacheamos la lista sin filtros — con filtros va directo a DB
  if (Object.keys(filter).length === 0) {
    return getOrSet(
      CacheKeys.userList(orgId),
      () => findAllUsers(orgId, filter),
      CacheTTL.SHORT,
    );
  }

  return findAllUsers(orgId, filter);
}

// ── Creación ───────────────────────────────────────────────────────────────

export async function registerUser(dto: CreateUserDto): Promise<User> {
  const existing = await findUserByEmail(dto.email);

  if (existing) {
    throw new ForbiddenError('Email is already registered');
  }

  const user = await createUser(dto);

  // Invalidar lista para que el próximo request la recargue
  await cacheDel(CacheKeys.userList(dto.orgId));

  logger.info({ userId: user.id, orgId: dto.orgId }, 'User registered');

  return user;
}

// ── Actualización ──────────────────────────────────────────────────────────

export async function editUser(
  id: string,
  orgId: string,
  dto: UpdateUserDto,
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

  return updated;
}

export async function changeUserStatus(
  id: string,
  orgId: string,
  status: UserStatus,
  actorId: string,
): Promise<User> {
  if (id === actorId) {
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

  return updated;
}

// ── Eliminación ────────────────────────────────────────────────────────────

export async function removeUser(
  id: string,
  orgId: string,
  actorId: string,
): Promise<void> {
  if (id === actorId) {
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
}