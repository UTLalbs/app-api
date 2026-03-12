import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getRedisClient } from '../../config/redis';
import { AuthError } from '../../shared/errors/AppError';
import type { User } from '../users/user.types';

import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair,
} from './auth.types';


// TTL en segundos
const ACCESS_TOKEN_TTL = 15 * 60;          // 15 minutos
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 días

// ── Claves Redis ───────────────────────────────────────────────────────────
function refreshTokenKey(userId: string, jti: string): string {
  return `auth:refresh:${userId}:${jti}`;
}

// ── Emitir tokens ──────────────────────────────────────────────────────────

export function issueAccessToken(user: User): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    orgId: user.orgId,
    roles: user.roles,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomUUID();

  const payload: RefreshTokenPayload = {
    sub: userId,
    jti,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });

  // Guardar en Redis — permite revocar el token
  await getRedisClient().set(
    refreshTokenKey(userId, jti),
    '1',
    'EX',
    REFRESH_TOKEN_TTL,
  );

  return token;
}

export async function issueTokenPair(user: User): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    issueAccessToken(user),
    issueRefreshToken(user.id),
  ]);

  return { accessToken, refreshToken };
}

// ── Verificar tokens ───────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Access token expired');
    }
    throw new AuthError('Invalid access token');
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  let payload: RefreshTokenPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as RefreshTokenPayload;
  } catch {
    throw new AuthError('Invalid refresh token');
  }

  // Verificar que el token existe en Redis (no fue revocado)
  const exists = await getRedisClient().get(
    refreshTokenKey(payload.sub, payload.jti),
  );

  if (!exists) {
    throw new AuthError('Refresh token has been revoked');
  }

  return payload;
}

// ── Revocar tokens ─────────────────────────────────────────────────────────

export async function revokeRefreshToken(
  userId: string,
  jti: string,
): Promise<void> {
  await getRedisClient().del(refreshTokenKey(userId, jti));
  logger.info({ userId }, 'Refresh token revoked');
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  // Eliminar todos los refresh tokens del usuario
  const pattern = refreshTokenKey(userId, '*');
  const keys = await getRedisClient().keys(pattern);

  if (keys.length > 0) {
    await getRedisClient().del(...keys);
  }

  logger.info({ userId, revokedCount: keys.length }, 'All user tokens revoked');
}

// ── Cookie options ─────────────────────────────────────────────────────────
// Exportamos para usarlos en el controller de forma consistente

export const accessTokenCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: ACCESS_TOKEN_TTL * 1000,
  path: '/',
};

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: REFRESH_TOKEN_TTL * 1000,
  path: '/api/v1/auth/refresh',  // solo se envía en el endpoint de refresh
};