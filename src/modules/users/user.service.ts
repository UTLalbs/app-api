import { logger } from '../../config/logger';
import { NotFoundError, ForbiddenError } from '../../shared/errors/AppError';

import {
  findUserById,
  findUserByEmail,
  findAllUsers,
  createUser,
  updateUser,
  softDeleteUser,
} from './user.repository';
import type { CreateUserDto, UpdateUserDto, User, UserStatus } from './user.types';

// ── Consultas ──────────────────────────────────────────────────────────────

export async function getUserById(id: string, orgId: string): Promise<User> {
  const user = await findUserById(id, orgId);

  if (!user) throw new NotFoundError('User');

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return findUserByEmail(email);
}

export async function listUsers(
  orgId: string,
  filter: { status?: UserStatus } = {},
): Promise<User[]> {
  return findAllUsers(orgId, filter);
}

// ── Creación ───────────────────────────────────────────────────────────────

export async function registerUser(dto: CreateUserDto): Promise<User> {
  // Regla: no puede existir otro usuario con el mismo email en el sistema
  const existing = await findUserByEmail(dto.email);

  if (existing) {
    // Si ya existe pero en otra org — lanzamos conflict
    // El linking de identidades SSO se maneja en authService, no aquí
    throw new ForbiddenError('Email is already registered');
  }

  const user = await createUser(dto);

  logger.info({ userId: user.id, orgId: dto.orgId }, 'User registered');

  return user;
}

// ── Actualización ──────────────────────────────────────────────────────────

export async function editUser(
  id: string,
  orgId: string,
  dto: UpdateUserDto,
): Promise<User> {
  // Regla: verificar que el usuario existe antes de editar
  const existing = await findUserById(id, orgId);

  if (!existing) throw new NotFoundError('User');

  const updated = await updateUser(id, orgId, dto);

  logger.info({ userId: id }, 'User updated');

  return updated;
}

export async function changeUserStatus(
  id: string,
  orgId: string,
  status: UserStatus,
  actorId: string,
): Promise<User> {
  // Regla: un usuario no puede cambiar su propio status
  if (id === actorId) {
    throw new ForbiddenError('Cannot change your own account status');
  }

  const existing = await findUserById(id, orgId);
  if (!existing) throw new NotFoundError('User');

  const updated = await updateUser(id, orgId, { status });

  logger.info({ userId: id, status, actorId }, 'User status changed');

  return updated;
}

// ── Eliminación ────────────────────────────────────────────────────────────

export async function removeUser(
  id: string,
  orgId: string,
  actorId: string,
): Promise<void> {
  // Regla: un usuario no puede eliminarse a sí mismo
  if (id === actorId) {
    throw new ForbiddenError('Cannot delete your own account');
  }

  const existing = await findUserById(id, orgId);
  if (!existing) throw new NotFoundError('User');

  await softDeleteUser(id, orgId);

  logger.info({ userId: id, actorId }, 'User removed');
}