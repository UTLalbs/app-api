import {ObjectId, type Filter} from "mongodb";

import {getRedisClient} from "../config/redis";
import type {AuthenticatedUser} from "../modules/auth/auth.types";
import type {PermissionScope, ScopeFilters} from "../modules/roles/role.types";
import {getUserCollection} from "../modules/users/user.model";

// ── Cache de jerarquía de equipo ──────────────────────────────────────────
// $graphLookup con maxDepth 5 sobre 200+ empleados es lento. Cache corto
// (60s) para amortizar lecturas repetidas dentro de una misma sesión sin
// retener datos viejos cuando la jerarquía cambia.

const TEAM_CACHE_TTL = 60;

function teamCacheKey(userId: string): string {
	return `auth:team:${userId}`;
}

// ── Resolver árbol de reportes directos + indirectos ──────────────────────
// Retorna el ObjectId del propio usuario + todos los empleados que reportan
// a él (directa o indirectamente, hasta 5 niveles). Usado por el scope `team`.

export async function getTeamHierarchy(
	userId: string,
	orgId: string,
): Promise<string[]> {
	const cacheKey = teamCacheKey(userId);
	const cached = await getRedisClient().get(cacheKey);
	if (cached) return JSON.parse(cached) as string[];

	const result = await getUserCollection()
		.aggregate<{teamIds?: ObjectId[]}>([
			{$match: {_id: new ObjectId(userId), orgId: new ObjectId(orgId)}},
			{
				$graphLookup: {
					from: "users",
					startWith: "$_id",
					connectFromField: "_id",
					connectToField: "employeeProfile.managerId",
					as: "team",
					maxDepth: 5,
				},
			},
			{$project: {teamIds: "$team._id"}},
		])
		.toArray();

	const team = (result[0]?.teamIds ?? []).map((id) => id.toHexString());
	const hierarchy = [userId, ...team];

	await getRedisClient().set(
		cacheKey,
		JSON.stringify(hierarchy),
		"EX",
		TEAM_CACHE_TTL,
	);

	return hierarchy;
}

// Invalidación explícita cuando un employee cambia de manager.
// Hay que limpiar al empleado, al manager anterior y al nuevo, ya que
// cualquiera de los tres puede tener su árbol en cache.
export async function invalidateTeamHierarchyCache(
	userIds: Array<string | null | undefined>,
): Promise<void> {
	const keys = userIds
		.filter((id): id is string => Boolean(id))
		.map(teamCacheKey);
	if (keys.length === 0) return;
	await getRedisClient().del(...keys);
}

// ── Construir filtro de Mongo según el scope ──────────────────────────────
// Retorna un Filter listo para mergear con la query principal.
// `targetCollection` indica sobre qué colección se filtra para usar la clave
// correcta de "empleado dueño del registro":
//   - 'users':       _id
//   - 'time_clocks', 'schedules', etc.: employeeId

export type ScopeTargetCollection =
	| "users"
	| "time_clocks"
	| "schedules"
	| "employees";

const ID_FIELD_BY_TARGET: Record<ScopeTargetCollection, string> = {
	users: "_id",
	employees: "_id",
	time_clocks: "employeeId",
	schedules: "employeeId",
};

export async function buildScopeFilter(
	user: AuthenticatedUser,
	scope: PermissionScope | undefined,
	target: ScopeTargetCollection,
): Promise<Filter<Record<string, unknown>>> {
	const effective: PermissionScope = scope ?? {type: "all"};
	const idField = ID_FIELD_BY_TARGET[target];

	switch (effective.type) {
		case "all":
			return {};

		case "self": {
			return {[idField]: new ObjectId(user.id)};
		}

		case "team": {
			if (!user.orgId) return {[idField]: new ObjectId(user.id)};
			const ids = await getTeamHierarchy(user.id, user.orgId);
			return {
				[idField]: {$in: ids.map((id) => new ObjectId(id))},
			};
		}

		case "custom": {
			const conditions = buildCustomScopeConditions(effective.filters, target);
			if (conditions.length === 0) return {};
			// Una sola dimensión por entrada (ver validador). Si por alguna razón
			// hay más de una condición, se combinan con $and. Cuando coexisten
			// varias entradas de Permission con scope custom para el mismo
			// (resource, action), el authorize ya elige el más amplio y aquí
			// procesamos esa única entrada.
			return conditions.length === 1 ? conditions[0] : {$and: conditions};
		}
	}
}

function buildCustomScopeConditions(
	filters: ScopeFilters,
	target: ScopeTargetCollection,
): Array<Filter<Record<string, unknown>>> {
	const conditions: Array<Filter<Record<string, unknown>>> = [];

	// Para colecciones que no son de usuarios (e.g. time_clocks), las
	// dimensiones de filtro siguen referenciando atributos del empleado.
	// Las queries dependientes deben hacer un $lookup previo o nuestro
	// repo debe resolver primero los user IDs que matcheen los filtros.
	// En esta primera entrega solo soportamos custom scope sobre colecciones
	// de empleados directamente (users / employees).
	const targetsEmployees = target === "users" || target === "employees";
	if (!targetsEmployees) {
		// TODO: cuando se implementen time_clocks/schedules, resolver primero
		// los employeeIds que matcheen los filtros y luego filtrar por employeeId.
		// Por ahora, custom scope sobre estas colecciones se comporta como `team`
		// para no exponer datos no autorizados.
		return [];
	}

	if (filters.departmentKeys?.length) {
		conditions.push({
			"employeeProfile.department": {$in: filters.departmentKeys},
		});
	}
	if (filters.positionKeys?.length) {
		conditions.push({
			"employeeProfile.position": {$in: filters.positionKeys},
		});
	}
	if (filters.locationIds?.length) {
		conditions.push({
			"employeeProfile.assignedLocationIds": {
				$in: filters.locationIds.map((id) => new ObjectId(id)),
			},
		});
	}

	return conditions;
}
