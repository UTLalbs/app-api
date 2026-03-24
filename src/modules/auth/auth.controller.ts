import type {Request, Response} from "express";

import {logger} from "../../config/logger";
import {getRedisClient} from "../../config/redis";
import {AuthError} from "../../shared/errors/AppError";
import {asyncHandler} from "../../shared/utils/asyncHandler";

import {
	loginWithOIDC,
	refreshSession,
	logout,
	logoutAllDevices,
} from "./auth.service";
import {
	getGoogleAuthorizationUrl,
	handleGoogleCallback,
	generateState,
	generateCodeVerifier,
} from "./strategies/google.strategy";
import {
	getMicrosoftAuthorizationUrl,
	handleMicrosoftCallback,
} from "./strategies/microsoft.strategy";
import {
	verifyRefreshToken,
	accessTokenCookieOptions,
	refreshTokenCookieOptions,
} from "./token.service";

// TTL para state y codeVerifier en Redis (10 minutos)
const PKCE_TTL = 60 * 10;

// ── Helpers para guardar/recuperar PKCE en Redis ───────────────────────────

async function savePKCE(
	state: string,
	codeVerifier: string,
	provider: string,
): Promise<void> {
	await getRedisClient().set(
		`auth:pkce:${state}`,
		JSON.stringify({codeVerifier, provider}),
		"EX",
		PKCE_TTL,
	);
}

async function getPKCE(
	state: string,
): Promise<{codeVerifier: string; provider: string} | null> {
	const data = await getRedisClient().get(`auth:pkce:${state}`);
	if (!data) return null;
	return JSON.parse(data) as {codeVerifier: string; provider: string};
}

async function deletePKCE(state: string): Promise<void> {
	await getRedisClient().del(`auth:pkce:${state}`);
}

// ── Google ─────────────────────────────────────────────────────────────────

// GET /api/v1/auth/google
// Redirige al usuario a Google para autenticarse
export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	// Guardar PKCE en Redis — se verifica en el callback
	await savePKCE(state, codeVerifier, "google");

	const authUrl = getGoogleAuthorizationUrl(state, codeVerifier);

	logger.info("Redirecting to Google login");
	res.redirect(authUrl);
});

// GET /api/v1/auth/google/callback
// Google redirige aquí con el authorization code
export const googleCallback = asyncHandler(
	async (req: Request, res: Response) => {
		const {state} = req.query as {state: string};

		if (!state) throw new AuthError("Missing state parameter");

		// Recuperar PKCE de Redis
		const pkce = await getPKCE(state);
		if (!pkce)
			throw new AuthError("Invalid or expired state — please try again");

		// Limpiar PKCE inmediatamente — solo se usa una vez
		await deletePKCE(state);

		// Construir URL completa del callback para openid-client
		const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

		// Procesar callback con Google
		const profile = await handleGoogleCallback(
			currentUrl,
			state,
			pkce.codeVerifier,
		);

		// Obtener orgId — en producción viene del subdominio o de la sesión
		// Buscar orgId por email del perfil
		const {findUserByEmail} = await import("../users/user.repository");
		const existingUser = await findUserByEmail(profile.email);
		const orgId = existingUser?.orgId ?? (req.query.orgId as string);
		if (!orgId)
			throw new AuthError("User not found — contact your administrator");

		// Login / registro / identity linking
		const {user, tokens, isNewUser} = await loginWithOIDC(profile, orgId);

		// Setear cookies HttpOnly
		res
			.cookie("access_token", tokens.accessToken, accessTokenCookieOptions)
			.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions);

		logger.info({userId: user.id, isNewUser}, "Google login successful");

		// Redirigir al frontend
		const redirectUrl = isNewUser ? "/onboarding" : "/dashboard";
		res.redirect(
			`${process.env.FRONTEND_URL ?? "http://localhost:5173"}${redirectUrl}`,
		);
	},
);

// ── Microsoft ──────────────────────────────────────────────────────────────

// GET /api/v1/auth/microsoft
export const microsoftLogin = asyncHandler(
	async (req: Request, res: Response) => {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();

		await savePKCE(state, codeVerifier, "microsoft");

		const authUrl = getMicrosoftAuthorizationUrl(state, codeVerifier);

		logger.info("Redirecting to Microsoft login");
		res.redirect(authUrl);
	},
);

// GET /api/v1/auth/microsoft/callback
export const microsoftCallback = asyncHandler(
	async (req: Request, res: Response) => {
		const {state} = req.query as {state: string};

		if (!state) throw new AuthError("Missing state parameter");

		const pkce = await getPKCE(state);
		if (!pkce)
			throw new AuthError("Invalid or expired state — please try again");

		await deletePKCE(state);

		const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

		const profile = await handleMicrosoftCallback(
			currentUrl,
			state,
			pkce.codeVerifier,
		);
		// Buscar orgId por email del perfil
		const {findUserByEmail} = await import("../users/user.repository");
		const existingUser = await findUserByEmail(profile.email);
		const orgId = existingUser?.orgId ?? (req.query.orgId as string);
		if (!orgId)
			throw new AuthError("User not found — contact your administrator");

		const {user, tokens, isNewUser} = await loginWithOIDC(profile, orgId);

		res
			.cookie("access_token", tokens.accessToken, accessTokenCookieOptions)
			.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions);

		logger.info({userId: user.id, isNewUser}, "Microsoft login successful");

		const redirectUrl = isNewUser ? "/onboarding" : "/dashboard";
		res.redirect(
			`${process.env.FRONTEND_URL ?? "http://localhost:5173"}${redirectUrl}`,
		);
	},
);

// ── Refresh token ──────────────────────────────────────────────────────────

// POST /api/v1/auth/refresh
export const refresh = asyncHandler(async (req: Request, res: Response) => {
	const refreshToken = req.cookies?.refresh_token as string | undefined;

	if (!refreshToken) throw new AuthError("No refresh token provided");

	const tokens = await refreshSession(refreshToken);

	res
		.cookie("access_token", tokens.accessToken, accessTokenCookieOptions)
		.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions)
		.json({success: true});
});

// ── Logout ─────────────────────────────────────────────────────────────────

// POST /api/v1/auth/logout
export const logoutHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const refreshToken = req.cookies?.refresh_token as string | undefined;

		if (refreshToken) {
			try {
				const payload = await verifyRefreshToken(refreshToken);
				await logout(payload.sub, payload.jti);
			} catch {
				// Si el token ya expiró o es inválido, ignoramos el error
				// igual limpiamos las cookies
			}
		}

		// Limpiar cookies
		res
			.clearCookie("access_token")
			.clearCookie("refresh_token")
			.json({success: true});
	},
);

// POST /api/v1/auth/logout-all
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
	if (!req.user) throw new AuthError("Not authenticated");

	await logoutAllDevices(req.user.id);

	res
		.clearCookie("access_token")
		.clearCookie("refresh_token")
		.json({success: true});
});

// GET /api/v1/auth/me
// Retorna el usuario autenticado actual
export const me = asyncHandler(async (req: Request, res: Response) => {
	if (!req.user) throw new AuthError("Not authenticated");

	res.json({success: true, data: req.user});
});
