import type {CookieOptions} from "express";
import jwt from "jsonwebtoken";

import {env} from "../../config/env";
import {AuthError} from "../../shared/errors/AppError";
import {createToken, invalidateUserTokens} from "../tokens/token.service";
import type {User} from "../users/user.types";

import type {
	AccessTokenPayload,
	RefreshTokenPayload,
	TokenPair,
} from "./auth.types";

// ── Access Token ───────────────────────────────────────────────────────────
// JWT de corta duración — 15 minutos
// Se verifica en cada request sin tocar la DB

const ACCESS_TOKEN_TTL = "15m";
const ACCESS_TOKEN_IMPERSONATE_TTL = "8h"; // ← agregar

export function issueAccessToken(
	user: User,
	impersonating?: {orgId: string; orgName: string} | null,
): string {
	const payload: AccessTokenPayload = {
		sub: user.id,
		email: user.email,
		orgId: user.orgId ?? null,
		userType: user.userType,
		roles: user.roles,
		impersonating: impersonating ?? null,
	};

	// Si está impersonando → token dura 8 horas
	const expiresIn = impersonating
		? ACCESS_TOKEN_IMPERSONATE_TTL
		: ACCESS_TOKEN_TTL;

	return jwt.sign(payload, env.JWT_SECRET, {expiresIn});
}

export function verifyAccessToken(token: string): AccessTokenPayload {
	try {
		return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
	} catch {
		throw new AuthError("Invalid or expired access token");
	}
}

// ── Refresh Token ──────────────────────────────────────────────────────────
// Token de larga duración guardado en MongoDB
// Se usa para emitir nuevos access tokens sin re-login

export async function issueRefreshToken(
	userId: string,
	orgId?: string,
): Promise<string> {
	const tokenDoc = await createToken({
		userId,
		orgId: orgId ?? null,
		type: "refresh",
	});

	return tokenDoc.token;
}

export async function verifyRefreshToken(
	token: string,
): Promise<RefreshTokenPayload> {
	const {findValidToken} = await import("../tokens/token.service");

	const tokenDoc = await findValidToken(token, "refresh");

	if (!tokenDoc) {
		throw new AuthError("Invalid or expired refresh token");
	}

	return {
		sub: tokenDoc.userId,
		jti: tokenDoc.id,
	};
}

export async function revokeRefreshToken(
	_userId: string,
	tokenId: string,
): Promise<void> {
	const {getTokenCollection} = await import("../tokens/token.model");
	const {ObjectId} = await import("mongodb");

	await getTokenCollection().updateOne(
		{_id: new ObjectId(tokenId), usedAt: null},
		{$set: {usedAt: new Date()}},
	);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
	await invalidateUserTokens(userId, "refresh");
}

// ── Issue par de tokens ────────────────────────────────────────────────────
export async function issueTokenPair(
	user: User,
	impersonating?: {orgId: string; orgName: string} | null,
): Promise<TokenPair> {
	const accessToken = issueAccessToken(user, impersonating);
	const refreshToken = await issueRefreshToken(
		user.id,
		user.orgId ?? undefined,
	);

	return {accessToken, refreshToken};
}

// ── Cookie options ─────────────────────────────────────────────────────────

export const accessTokenCookieOptions: CookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: "lax",
	maxAge: 15 * 60 * 1000, // 15 minutos
};

export const impersonateTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure:   env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   8 * 60 * 60 * 1000,  // 8 horas
};

export const refreshTokenCookieOptions: CookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: "lax",
	maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
	path: "/api/v1/auth/refresh",
};
