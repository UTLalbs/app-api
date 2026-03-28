import type { NextFunction, Request, Response } from 'express';

import { getRedisClient } from '../config/redis';
import { verifyAccessToken } from '../modules/auth/token.service';
import { getOrgTimezone } from '../modules/organizations/organization.service';
import { findUserById } from '../modules/users/user.repository';
import { AuthError } from '../shared/errors/AppError';


const DEFAULT_TIMEZONE = 'America/Mexico_City';
const USER_CACHE_TTL   = 60 * 5;

function userCacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token =
      req.cookies?.access_token ??
      req.headers.authorization?.replace('Bearer ', '');

    if (!token) throw new AuthError('No access token provided');

    const payload = verifyAccessToken(token);

    // Si hay impersonation activa — no usar cache
    if (payload.impersonating) {
      const user = await findUserById(payload.sub, '');
      if (!user) throw new AuthError('User not found');
      if (user.status === 'inactive') throw new AuthError('Account is disabled');

      const orgTimezone  = await getOrgTimezone(payload.impersonating.orgId);
      const userTimezone = user.preferences?.timezone ?? orgTimezone;

      req.user = {
        id:           user.id,
        email:        user.email,
        displayName:  user.displayName,
        orgId:        payload.impersonating.orgId,
        userType:     user.userType,
        roles:        user.roles,
        impersonating: payload.impersonating,
        orgTimezone,
        userTimezone,
        resolvedPermissions: {},
      };
      req.orgId = payload.impersonating.orgId;
      return next();
    }

    // ── Buscar en cache Redis ──────────────────────────────────────────────
    const cacheKey = userCacheKey(payload.sub);
    const cached   = await getRedisClient().get(cacheKey);

    if (cached) {
      req.user  = JSON.parse(cached);
      req.orgId = req.user!.orgId ?? undefined;
      return next();
    }

    // ── Cache miss — buscar en MongoDB ────────────────────────────────────
    const user = await findUserById(payload.sub, payload.orgId ?? '');
    if (!user) throw new AuthError('User not found');
    if (user.status === 'inactive') throw new AuthError('Account is disabled');

    // ── Resolver timezones ─────────────────────────────────────────────────
    let orgTimezone  = DEFAULT_TIMEZONE;
    let userTimezone = DEFAULT_TIMEZONE;

    if (user.orgId) {
      orgTimezone = await getOrgTimezone(user.orgId);
    }

    userTimezone = user.preferences?.timezone ?? orgTimezone;

    // ── Construir AuthenticatedUser ────────────────────────────────────────
    const authenticatedUser = {
      id:           user.id,
      email:        user.email,
      displayName:  user.displayName,
      orgId:        user.orgId ?? null,
      userType:     user.userType,
      roles:        user.roles,
      impersonating: null,
      orgTimezone,
      userTimezone,
      resolvedPermissions: {},
    };

    // ── Guardar en cache Redis ─────────────────────────────────────────────
    await getRedisClient().set(
      cacheKey,
      JSON.stringify(authenticatedUser),
      'EX',
      USER_CACHE_TTL,
    );

    req.user  = authenticatedUser;
    req.orgId = authenticatedUser.orgId ?? undefined;

    next();
  } catch (err) {
    next(err);
  }
}