import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ObjectId } from 'mongodb';

import { getRedisClient } from '../config/redis';
import { getRoleCollection } from '../modules/roles/role.model';
import type { Action } from '../modules/roles/role.types';
import { ForbiddenError } from '../shared/errors/AppError';

// TTL del cache de permisos en Redis — 5 minutos
const PERMISSIONS_CACHE_TTL = 60 * 5;

function permissionsCacheKey(userId: string): string {
  return `auth:permissions:${userId}`;
}

// ── Resolver permisos del usuario ─────────────────────────────────────────
// Carga los roles del usuario desde MongoDB y aplana los permisos
// Cachea el resultado en Redis para evitar queries repetidos

interface ResolvedPermissions {
  [resource: string]: Set<Action>;
}

async function resolvePermissions(
  roleIds: string[],
): Promise<ResolvedPermissions> {
  if (roleIds.length === 0) return {};

  const roles = await getRoleCollection()
    .find(
      { _id: { $in: roleIds.map((id) => new ObjectId(id)) } },
      { projection: { permissions: 1 } },
    )
    .toArray();

  const resolved: ResolvedPermissions = {};

  for (const role of roles) {
    for (const permission of role.permissions) {
      if (!resolved[permission.resource]) {
        resolved[permission.resource] = new Set<Action>();
      }
      for (const action of permission.actions) {
        resolved[permission.resource].add(action);
      }
    }
  }

  return resolved;
}

async function getResolvedPermissions(
  userId: string,
  roleIds: string[],
): Promise<ResolvedPermissions> {
  const cacheKey = permissionsCacheKey(userId);
  const cached = await getRedisClient().get(cacheKey);

  if (cached) {
    // Deserializar — Sets no se serializan directamente en JSON
    const raw = JSON.parse(cached) as Record<string, Action[]>;
    const resolved: ResolvedPermissions = {};
    for (const [resource, actions] of Object.entries(raw)) {
      resolved[resource] = new Set(actions);
    }hasPermission
    return resolved;
  }

  const resolved = await resolvePermissions(roleIds);

  // Serializar Sets a arrays para Redis
  const serializable: Record<string, Action[]> = {};
  for (const [resource, actions] of Object.entries(resolved)) {
    serializable[resource] = Array.from(actions);
  }

  await getRedisClient().set(
    cacheKey,
    JSON.stringify(serializable),
    'EX',
    PERMISSIONS_CACHE_TTL,
  );

  return resolved;
}

// ── Verificar si el usuario tiene permiso ─────────────────────────────────

function hasPermission(resolved: ResolvedPermissions, resource: string, action: Action): boolean {
  const resourcePermissions = resolved[resource];
  if (!resourcePermissions) return false;
  return resourcePermissions.has(action);
}

// ── Middleware factory ─────────────────────────────────────────────────────
// Uso: authorize('services', 'read')
//      authorize('users', 'delete')

export function authorize(resource: string, action: Action): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Not authenticated');
      }

      const resolved = await getResolvedPermissions(
        req.user.id,
        req.user.roles,
      );

      if (!hasPermission(resolved, resource, action)) {
        throw new ForbiddenError(
          `Missing permission: ${resource}:${action}`,
        );
      }

      // Adjuntar permisos resueltos al request para uso en controllers
      // Útil para filtros de cliente (clientId scope)
      req.user.resolvedPermissions = Object.fromEntries(
        Object.entries(resolved).map(([r, a]) => [r, Array.from(a)]),
      );

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Helper para invalidar cache de permisos ───────────────────────────────
// Llamar cuando se cambian los roles de un usuario

export async function invalidatePermissionsCache(userId: string): Promise<void> {
  await getRedisClient().del(permissionsCacheKey(userId));
}