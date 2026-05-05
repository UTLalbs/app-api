import {logger} from "../../config/logger";
import {USER_STATUS} from "../../shared/constants";
import {AuthError, ForbiddenError} from "../../shared/errors/AppError";
import {createAuditEvent, emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {
	findUserByEmail,
	findUserByIdentity,
	createUser,
	linkUserIdentity,
	updateUserLastLogin,
} from "../users/user.repository";
import type {User} from "../users/user.types";

import type {OIDCProfile, TokenPair} from "./auth.types";
import {issueTokenPair} from "./token.service";

export interface LoginResult {
	user: User;
	tokens: TokenPair;
	isNewUser: boolean;
}

// ── Flujo principal de login SSO ───────────────────────────────────────────

export async function loginWithOIDC(
	profile: OIDCProfile,
	orgId?: string,
	context?: AuditContext,
): Promise<LoginResult> {
	// Regla 1: email debe estar verificado
	if (!profile.emailVerified) {
		throw new AuthError("Email not verified by identity provider");
	}

	const providerField = profile.provider === "google" ? "google" : "microsoft";

	// Regla 2: buscar por subjectId
	let user = await findUserByIdentity(providerField, profile.subjectId);
	let isNewUser = false;

	if (!user) {
		const existingUser = await findUserByEmail(profile.email);

		if (existingUser) {
			// Regla 3: identity linking
			logger.info(
				{userId: existingUser.id, provider: profile.provider},
				"Linking new identity to existing user",
			);

			user = await linkUserIdentity(
				existingUser.id,
				providerField,
				profile.subjectId,
				profile.email,
			);
		} else {
			// Regla 4: usuario nuevo
			// super_admin no necesita orgId
			// usuarios normales sí lo requieren
			if (!orgId) {
				// Verificar si es el primer super_admin del sistema
				// En producción esto se controla con un flag en .env
				throw new AuthError(
					"Organization not specified — please contact your administrator",
				);
			}

			logger.info(
				{email: profile.email, provider: profile.provider},
				"Creating new user from OIDC profile",
			);

			user = await createUser({
				email: profile.email,
				displayName: profile.displayName,
				orgId,
				identities: {
					local: null,
					google:
						profile.provider === "google"
							? {
									sub: profile.subjectId,
									email: profile.email,
									connectedAt: new Date(),
								}
							: null,
					microsoft:
						profile.provider === "microsoft"
							? {
									sub: profile.subjectId,
									email: profile.email,
									connectedAt: new Date(),
								}
							: null,
				},
			});

			isNewUser = true;
		}
	}

	// Regla 5: cuenta deshabilitada
	if (user.status === USER_STATUS.INACTIVE || user.status === USER_STATUS.SUSPENDED) {
		logger.warn({userId: user.id}, "Disabled user attempted login");
		throw new ForbiddenError("Account is disabled");
	}

	// Regla 6: cuenta pendiente NO puede autenticarse — debe ser activada
	// primero por un admin (RH-004). Un super_admin sí puede entrar aunque
	// esté pending (caso bootstrap de la plataforma).
	if (
		user.status === USER_STATUS.PENDING &&
		user.userType !== "super_admin"
	) {
		logger.warn(
			{userId: user.id},
			"Pending user attempted login — blocked",
		);
		throw new ForbiddenError(
			"Tu cuenta está pendiente de activación. Contacta al administrador de tu organización.",
		);
	}

	// Fire and forget
	updateUserLastLogin(user.id).catch((err) =>
		logger.error({err, userId: user.id}, "Failed to update lastLoginAt"),
	);

	const tokens = await issueTokenPair(user);

	// Evento de login: el actor del contexto son las credenciales del request
	// (req.user NO existe aún en el callback OIDC). Usamos el user recién
	// autenticado como actor — él es responsable de su propio login_success.
	if (context) {
		await emitAuditEvent({
			category: "auth",
			action: "login_success",
			metadata: {
				provider: profile.provider,
				isNewUser,
				userType: user.userType,
			},
			context: {
				...context,
				actor: {
					id: user.id,
					email: user.email,
					displayName: user.displayName,
					userType: user.userType,
				},
				orgId: user.orgId ?? null,
			},
		});
	} else {
		// Fallback — sin req (tests, scripts). Emite con contexto mínimo sintético.
		await createAuditEvent({
			category: "auth",
			action: "login_success",
			actor: {
				id: user.id,
				email: user.email,
				displayName: user.displayName,
			},
			orgId: user.orgId ?? undefined,
			metadata: {
				provider: profile.provider,
				isNewUser,
				userType: user.userType,
			},
		});
	}

	logger.info(
		{
			userId: user.id,
			provider: profile.provider,
			isNewUser,
			userType: user.userType,
		},
		"User logged in successfully",
	);

	return {user, tokens, isNewUser};
}

// ── Refresh session ────────────────────────────────────────────────────────

export async function refreshSession(
	refreshToken: string,
	currentImpersonating?: {orgId: string; orgName: string | null},
): Promise<TokenPair> {
	const {
		verifyRefreshToken,
		issueTokenPair: reissue,
		revokeRefreshToken,
	} = await import("./token.service");
	const {findUserById} = await import("../users/user.repository");

	const payload = await verifyRefreshToken(refreshToken);

	await revokeRefreshToken(payload.sub, payload.jti);

	const user = await findUserById(payload.sub, "");

	if (!user) throw new AuthError("User not found");

	if (user.status === USER_STATUS.INACTIVE || user.status === USER_STATUS.SUSPENDED) {
		throw new ForbiddenError("Account is disabled");
	}

	// Pending también bloquea refresh (excepto super_admin para bootstrap).
	if (
		user.status === USER_STATUS.PENDING &&
		user.userType !== "super_admin"
	) {
		throw new ForbiddenError(
			"Tu cuenta está pendiente de activación.",
		);
	}

	// Preservar contexto de impersonación si existe
	const tokens = await reissue(user, currentImpersonating ?? null);

	logger.info(
		{userId: user.id, impersonating: !!currentImpersonating},
		"Session refreshed",
	);

	return tokens;
}

// ── Logout ─────────────────────────────────────────────────────────────────
//
// `jti` puede ser null cuando el refresh token ya expiró/revocó pero el usuario
// aún está cerrando sesión desde la app — el evento igual se emite para dejar
// traza de la intención. La revocación del refresh solo ocurre si hay jti válido.

export async function logout(
	userId: string,
	jti: string | null,
	context: AuditContext,
): Promise<void> {
	if (jti) {
		const {revokeRefreshToken} = await import("./token.service");
		await revokeRefreshToken(userId, jti);
	}

	await emitAuditEvent({
		category: "auth",
		action: "logout",
		metadata: jti ? {jti} : undefined,
		context,
	});

	logger.info({userId}, "User logged out");
}

export async function logoutAllDevices(
	userId: string,
	context: AuditContext,
): Promise<void> {
	const {revokeAllUserTokens} = await import("./token.service");

	await revokeAllUserTokens(userId);

	await emitAuditEvent({
		category: "auth",
		action: "logout_all",
		context,
	});

	logger.info({userId}, "User logged out from all devices");
}
