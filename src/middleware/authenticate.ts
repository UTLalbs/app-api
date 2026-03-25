import type {NextFunction, Request, Response} from "express";

import {getRedisClient} from "../config/redis";
import {verifyAccessToken} from "../modules/auth/token.service";
import {findUserById} from "../modules/users/user.repository";
import {AuthError} from "../shared/errors/AppError";

// TTL del cache de usuario en Redis — 5 minutos
const USER_CACHE_TTL = 60 * 5;

function userCacheKey(userId: string): string {
	return `auth:user:${userId}`;
}

export async function authenticate(
	req: Request,
	_res: Response,
	next: NextFunction,
): Promise<void> {
	try {
		// ── Extraer token de cookie o header Authorization ─────────────────────
		// Cookie tiene prioridad — es más seguro (HttpOnly)
		// Header Authorization es para clientes que no soportan cookies (ej: mobile)
		const token =
			req.cookies?.access_token ??
			req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			throw new AuthError("No access token provided");
		}

		// ── Verificar JWT ──────────────────────────────────────────────────────
		const payload = verifyAccessToken(token);

		// ── Buscar usuario en cache Redis ──────────────────────────────────────
		// Evita ir a MongoDB en cada request
		const cacheKey = userCacheKey(payload.sub);
		const cached = await getRedisClient().get(cacheKey);

		if (cached) {
			req.user = JSON.parse(cached);
			req.orgId = req.user!.orgId;
			return next();
		}

		// ── Cache miss — buscar en MongoDB ────────────────────────────────────
		const user = await findUserById(payload.sub, payload.orgId);

		if (!user) {
			throw new AuthError("User not found");
		}

		if (user.status === "inactive") {
			throw new AuthError("Account is disabled");
		}

		// ── Construir AuthenticatedUser ────────────────────────────────────────
		const authenticatedUser = {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			orgId: payload.impersonating?.orgId ?? user.orgId ?? null, // ← orgId de la org impersonada
			userType: user.userType,
			roles: user.roles,
			impersonating: payload.impersonating ?? null, 
			resolvedPermissions: {},
		};

		// ── Guardar en cache Redis ─────────────────────────────────────────────
		await getRedisClient().set(
			cacheKey,
			JSON.stringify(authenticatedUser),
			"EX",
			USER_CACHE_TTL,
		);

		req.user = authenticatedUser;
		req.orgId = authenticatedUser.orgId;

		next();
	} catch (err) {
		next(err);
	}
}
