import {ObjectId} from "mongodb";

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
import {getRoleCollection} from "../roles/role.model";


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

// ── Validación de asignación de roles ─────────────────────────────────────
// Solo super_admin puede asignar roles del sistema (orgId: null, isSystem: true).
// Hoy ese set se reduce a `super_admin`. Centralizado en una función para
// futuras adiciones de roles "globales" si llegara a haber.

async function assertCanAssignRoles(
  callerUserType: string | undefined,
  roleIds: string[],
): Promise<void> {
  if (callerUserType === 'super_admin' || roleIds.length === 0) return;

  const validIds = roleIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (validIds.length === 0) return;

  const roles = await getRoleCollection()
    .find(
      { _id: { $in: validIds } },
      { projection: { isSystem: 1, orgId: 1, name: 1 } },
    )
    .toArray();

  const restricted = roles.filter((r) => r.isSystem && r.orgId === null);
  if (restricted.length > 0) {
    throw new ForbiddenError(
      `Cannot assign system role(s): ${restricted.map((r) => r.name).join(', ')}`,
    );
  }
}

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

  // Guard RH-002: solo un super_admin operando fuera de impersonación puede
  // crear otros super_admin. Una organización (incluso bajo impersonación de
  // un super_admin) NO puede crear super_admins — son de scope plataforma.
  if (dto.userType === 'super_admin') {
    if (context.actor?.userType !== 'super_admin') {
      throw new ForbiddenError(
        'Solo un super_admin puede crear otro super_admin',
      );
    }
    if (context.impersonating) {
      throw new ForbiddenError(
        'No se puede crear un super_admin desde el contexto de una organización',
      );
    }
  }

  await assertCanAssignRoles(
    context.actor?.userType,
    (dto.roles ?? []).map((r) => r.roleId),
  );

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

  if (dto.roles !== undefined) {
    await assertCanAssignRoles(
      context.actor?.userType,
      dto.roles.map((r) => r.roleId),
    );
  }

  // Promoción a empleado vía PATCH /users/:id: si se está marcando isEmployee=true
  // por primera vez y no se especifica employmentStatus, default a 'active'. Sin
  // esto el doc queda con employmentStatus=undefined y findAllEmployees lo excluye.
  // Mismo defaulting que employee.service.updateEmployeeProfile.
  const wasEmployeeBefore = existing.employeeProfile?.isEmployee ?? false;
  const isBeingPromoted =
    !wasEmployeeBefore && dto.employeeProfile?.isEmployee === true;
  if (
    isBeingPromoted &&
    !dto.employeeProfile?.employmentStatus &&
    !existing.employeeProfile?.employmentStatus
  ) {
    dto.employeeProfile = {
      ...dto.employeeProfile,
      employmentStatus: 'active',
    };
  }

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