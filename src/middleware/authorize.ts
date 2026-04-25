import type {NextFunction, Request, RequestHandler, Response} from "express";
import {ObjectId} from "mongodb";

import {getRedisClient} from "../config/redis";
import {getRoleCollection} from "../modules/roles/role.model";
import type {
	Action,
	Permission,
	PermissionScope,
} from "../modules/roles/role.types";
import type {UserRoleDto} from "../modules/users/user.types";
import {USER_TYPE} from "../shared/constants";
import {ForbiddenError} from "../shared/errors/AppError";

// TTL del cache de permisos en Redis — 5 minutos
const PERMISSIONS_CACHE_TTL = 60 * 5;

function permissionsCacheKey(userId: string): string {
	return `auth:permissions:${userId}`;
}

// ── Resolver permisos del usuario ─────────────────────────────────────────
// Carga los roles del usuario desde MongoDB y aplana los permisos en una
// estructura: { [resource]: { [action]: PermissionScope[] } }.
// Cuando un mismo (resource, action) aparece en múltiples roles, se acumulan
// los scopes y al evaluar se toma el más amplio (all > team > custom > self).

interface ResolvedPermissions {
	[resource: string]: {
		[action: string]: PermissionScope[];
	};
}

const DEFAULT_SCOPE: PermissionScope = {type: "all"};

function getPermissionScope(permission: Permission): PermissionScope {
	return permission.scope ?? DEFAULT_SCOPE;
}

async function resolvePermissions(
	roleIds: string[],
): Promise<ResolvedPermissions> {
	if (roleIds.length === 0) return {};

	const roles = await getRoleCollection()
		.find(
			{_id: {$in: roleIds.map((id) => new ObjectId(id))}},
			{projection: {permissions: 1}},
		)
		.toArray();

	const resolved: ResolvedPermissions = {};

	for (const role of roles) {
		for (const permission of role.permissions) {
			const scope = getPermissionScope(permission);
			if (!resolved[permission.resource]) {
				resolved[permission.resource] = {};
			}
			const resourceMap = resolved[permission.resource];
			for (const action of permission.actions) {
				if (!resourceMap[action]) resourceMap[action] = [];
				resourceMap[action].push(scope);
			}
		}
	}

	return resolved;
}

export async function getResolvedPermissions(
	userId: string,
	roles: UserRoleDto[],
): Promise<ResolvedPermissions> {
	const cacheKey = permissionsCacheKey(userId);
	const cached = await getRedisClient().get(cacheKey);

	if (cached) {
		// El JSON ya trae el shape correcto (objetos planos con arrays de scope).
		return JSON.parse(cached) as ResolvedPermissions;
	}

	const roleIds = roles.map((r) => r.roleId);
	const resolved = await resolvePermissions(roleIds);

	await getRedisClient().set(
		cacheKey,
		JSON.stringify(resolved),
		"EX",
		PERMISSIONS_CACHE_TTL,
	);

	return resolved;
}

// ── Verificar si el usuario tiene permiso ─────────────────────────────────

function hasPermission(
	resolved: ResolvedPermissions,
	resource: string,
	action: Action,
): boolean {
	const resourcePermissions = resolved[resource];
	if (!resourcePermissions) return false;
	return Array.isArray(resourcePermissions[action])
		&& resourcePermissions[action].length > 0;
}

// ── Calcular scope efectivo (el más amplio entre los aplicables) ──────────
// Prioridad: all > team > custom > self.
// Si dos roles otorgan scope custom, se conserva el primero como representación
// (la combinación se aplica vía $or en buildScopeFilter del consumidor).

const SCOPE_RANK: Record<PermissionScope["type"], number> = {
	all: 4,
	team: 3,
	custom: 2,
	self: 1,
};

function getEffectiveScope(
	resolved: ResolvedPermissions,
	resource: string,
	action: Action,
): PermissionScope {
	const scopes = resolved[resource]?.[action];
	if (!scopes || scopes.length === 0) return DEFAULT_SCOPE;
	let widest: PermissionScope = scopes[0];
	for (const s of scopes) {
		if (SCOPE_RANK[s.type] > SCOPE_RANK[widest.type]) widest = s;
	}
	return widest;
}

// ── Middleware factory ─────────────────────────────────────────────────────
// Uso: authorize('services', 'read')
//      authorize('users', 'delete')
// Tras autorizar, adjunta req.user.permissionScope con el scope efectivo
// para que el handler pueda filtrar resultados (team, self, custom).

export function authorize(resource: string, action: Action): RequestHandler {
	return async (
		req: Request,
		_res: Response,
		next: NextFunction,
	): Promise<void> => {
		try {
			if (!req.user) {
				throw new ForbiddenError("Not authenticated");
			}

			// super_admin siempre tiene acceso — sin verificar permisos
			if (req.user.userType === USER_TYPE.SUPER_ADMIN) {
				req.user.permissionScope = DEFAULT_SCOPE;
				return next();
			}

			const resolved = await getResolvedPermissions(
				req.user.id,
				req.user.roles,
			);

			if (!hasPermission(resolved, resource, action)) {
				throw new ForbiddenError(`Missing permission: ${resource}:${action}`);
			}

			// Adjuntar permisos resueltos al request para uso en controllers
			// (formato simple para client-side filtering: { resource: actions[] }).
			req.user.resolvedPermissions = Object.fromEntries(
				Object.entries(resolved).map(([r, actionMap]) => [
					r,
					Object.keys(actionMap),
				]),
			);
			req.user.permissionScope = getEffectiveScope(resolved, resource, action);

			next();
		} catch (err) {
			next(err);
		}
	};
}

// ── Helper para invalidar cache de permisos ───────────────────────────────
// Llamar cuando se cambian los roles de un usuario.
// Borra también el cache de `authenticate` (`auth:user:${userId}`) porque ahí
// guardamos el `resolvedPermissions` aplanado para el frontend.

export async function invalidatePermissionsCache(
	userId: string,
): Promise<void> {
	const redis = getRedisClient();
	await Promise.all([
		redis.del(permissionsCacheKey(userId)),
		redis.del(`auth:user:${userId}`),
	]);
}
