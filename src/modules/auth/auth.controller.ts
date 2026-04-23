import type {Request, Response} from "express";
import jwt from "jsonwebtoken";



import {logger} from "../../config/logger";
import {getRedisClient} from "../../config/redis";
import {USER_TYPE} from "../../shared/constants";
import {AuthError} from "../../shared/errors/AppError";
import {asyncHandler} from "../../shared/utils/asyncHandler";
import {buildAuditContext} from "../../shared/utils/auditContext";

import {
	loginWithOIDC,
	refreshSession,
	logout,
	logoutAllDevices,
} from "./auth.service";
import type {AccessTokenPayload} from "./auth.types";
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
	impersonateTokenCookieOptions
} from "./token.service";

// TTL para state y codeVerifier en Redis (10 minutos)
const PKCE_TTL = 60 * 10;

// ── Helpers PKCE ───────────────────────────────────────────────────────────

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

// ── Helper redirect ────────────────────────────────────────────────────────

function getFrontendUrl(): string {
	return process.env.FRONTEND_URL ?? "http://localhost:3001";
}

function getRedirectUrl(userType: string, isNewUser: boolean): string {
	// super_admin siempre va al panel de administración
	if (userType === USER_TYPE.SUPER_ADMIN) {
		return `${getFrontendUrl()}/admin`;
	}

	// usuarios nuevos van al onboarding
	if (isNewUser) {
		return `${getFrontendUrl()}/onboarding`;
	}

	// usuarios existentes van al dashboard
	return `${getFrontendUrl()}/dashboard`;
}

// ── Google ─────────────────────────────────────────────────────────────────

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	await savePKCE(state, codeVerifier, "google");

	const authUrl = getGoogleAuthorizationUrl(state, codeVerifier);

	logger.info("Redirecting to Google login");
	res.redirect(authUrl);
});

export const googleCallback = asyncHandler(
	async (req: Request, res: Response) => {
		const {state} = req.query as {state: string};

		if (!state) throw new AuthError("Missing state parameter");

		const pkce = await getPKCE(state);
		if (!pkce)
			throw new AuthError("Invalid or expired state — please try again");

		await deletePKCE(state);

		const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

		const profile = await handleGoogleCallback(
			currentUrl,
			state,
			pkce.codeVerifier,
		);

		// orgId es opcional — super_admin no necesita uno
		const orgId =
			(req.query.orgId as string | undefined) ??
			(req.cookies?.pending_org_id as string | undefined);

		const {user, tokens, isNewUser} = await loginWithOIDC(
			profile,
			orgId,
			buildAuditContext(req),
		);

		res
			.cookie("access_token", tokens.accessToken, accessTokenCookieOptions)
			.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions);

		logger.info(
			{userId: user.id, isNewUser, userType: user.userType},
			"Google login successful",
		);

		res.redirect(getRedirectUrl(user.userType, isNewUser));
	},
);

// ── Microsoft ──────────────────────────────────────────────────────────────

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

		const orgId =
			(req.query.orgId as string | undefined) ??
			(req.cookies?.pending_org_id as string | undefined);

		const {user, tokens, isNewUser} = await loginWithOIDC(
			profile,
			orgId,
			buildAuditContext(req),
		);

		res
			.cookie("access_token", tokens.accessToken, accessTokenCookieOptions)
			.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions);

		logger.info(
			{userId: user.id, isNewUser, userType: user.userType},
			"Microsoft login successful",
		);

		res.redirect(getRedirectUrl(user.userType, isNewUser));
	},
);

// ── Refresh ────────────────────────────────────────────────────────────────
export const refresh = asyncHandler(async (req: Request, res: Response) => {
	const refreshToken = req.cookies?.refresh_token as string | undefined;

	if (!refreshToken) throw new AuthError("No refresh token provided");

	// Leer impersonación del access token actual (aunque esté expirado)
	let currentImpersonating: {orgId: string; orgName: string} | null = null;

	try {
		const currentToken =
			req.cookies?.access_token ??
			req.headers.authorization?.replace("Bearer ", "");

		if (currentToken) {
			const decoded = jwt.decode(currentToken) as AccessTokenPayload | null;
			currentImpersonating = decoded?.impersonating ?? null;
		}
	} catch {
		// Si no se puede decodificar — sin impersonación
	}

	const tokens = await refreshSession(refreshToken, currentImpersonating);

	res
		.cookie(
			"access_token",
			tokens.accessToken,
			currentImpersonating
				? impersonateTokenCookieOptions // ← 8h si impersonando
				: accessTokenCookieOptions, // ← 15m si normal
		)
		.cookie("refresh_token", tokens.refreshToken, refreshTokenCookieOptions)
		.json({success: true});
});

// ── Logout ─────────────────────────────────────────────────────────────────

export const logoutHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const refreshToken = req.cookies?.refresh_token as string | undefined;

		if (refreshToken) {
			try {
				const payload = await verifyRefreshToken(refreshToken);
				await logout(payload.sub, payload.jti);
			} catch {
				// token ya expirado — igual limpiamos cookies
			}
		}

		res
			.clearCookie("access_token")
			.clearCookie("refresh_token")
			.json({success: true});
	},
);

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
	if (!req.user) throw new AuthError("Not authenticated");

	await logoutAllDevices(req.user.id);

	res
		.clearCookie("access_token")
		.clearCookie("refresh_token")
		.json({success: true});
});

// ── Me ─────────────────────────────────────────────────────────────────────

export const me = asyncHandler(async (req: Request, res: Response) => {
	if (!req.user) throw new AuthError("Not authenticated");

	res.json({success: true, data: req.user});
});
