import {logger} from "../../config/logger";
import {AuthError, ForbiddenError} from "../../shared/errors/AppError";
import {createAuditEvent} from "../audit/audit.service";
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
// Llamado después de que Google o Microsoft validan al usuario
// y nos entregan el perfil OIDC verificado

export async function loginWithOIDC(
	profile: OIDCProfile,
	orgId: string,
): Promise<LoginResult> {
	// Regla 1: el email debe estar verificado por el provider
	if (!profile.emailVerified) {
		throw new AuthError("Email not verified by identity provider");
	}

	const providerField = profile.provider === "google" ? "google" : "microsoft";

	// Regla 2: buscar si ya existe un usuario con este subjectId
	let user = await findUserByIdentity(providerField, profile.subjectId);
	let isNewUser = false;

	if (!user) {
		// Regla 3: buscar por email para hacer identity linking
		const existingUser = await findUserByEmail(profile.email);

		if (existingUser) {
			// Regla 4: el usuario existe con otro provider — vincular identidad
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
			// Regla 5: usuario completamente nuevo — crear cuenta
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

	// Regla 6: cuenta deshabilitada no puede autenticarse
	if (user.status === "inactive") {
		logger.warn({userId: user.id}, "Disabled user attempted login");
		throw new ForbiddenError("Account is disabled");
	}

	// Regla 7: cuenta pendiente puede autenticarse pero el frontend
	// debe redirigirla al onboarding
	if (user.status === "pending") {
		logger.info({userId: user.id}, "Pending user logged in");
	}

	// Registrar último login — fire and forget, no bloquea el response
	updateUserLastLogin(user.id).catch((err) =>
		logger.error({err, userId: user.id}, "Failed to update lastLoginAt"),
	);

	// Emitir tokens
	const tokens = await issueTokenPair(user);

	await createAuditEvent({
		category: "auth",
		action: "login_success",
		actor: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
		},
		orgId: user.orgId,
		metadata: {
			provider: profile.provider,
			isNewUser,
		},
	});

	logger.info(
		{userId: user.id, provider: profile.provider, isNewUser},
		"User logged in successfully",
	);

	return {user, tokens, isNewUser};
}

// ── Refresh token ──────────────────────────────────────────────────────────

export async function refreshSession(refreshToken: string): Promise<TokenPair> {
	const {
		verifyRefreshToken,
		revokeRefreshToken,
		issueTokenPair: reissue,
	} = await import("./token.service");
	const {findUserById} = await import("../users/user.repository");

	// Verificar que el refresh token es válido y existe en Redis
	const payload = await verifyRefreshToken(refreshToken);

	// Obtener el usuario actualizado — puede haber cambiado roles desde el último login
	const user = await findUserById(payload.sub, "");

	if (!user) {
		throw new AuthError("User not found");
	}

	if (user.status === "inactive") {
		logger.warn({userId: user.id}, "Disabled user attempted login");
		throw new ForbiddenError("Account is disabled");
	}
	// Rotar el refresh token — revocar el actual y emitir uno nuevo
	await revokeRefreshToken(payload.sub, payload.jti);
	const tokens = await reissue(user);

	logger.info({userId: user.id}, "Session refreshed");

	return tokens;
}

// ── Logout ─────────────────────────────────────────────────────────────────

export async function logout(userId: string, jti: string): Promise<void> {
	const {revokeRefreshToken} = await import("./token.service");

	await revokeRefreshToken(userId, jti);

	await createAuditEvent({
		category: "auth",
		action: "logout",
		actor: {
			id: userId,
			email: "", // no disponible en logout por token
			displayName: "",
		},
		metadata: {jti},
	});

	logger.info({userId}, "User logged out");
}

export async function logoutAllDevices(userId: string): Promise<void> {
	const {revokeAllUserTokens} = await import("./token.service");

	await revokeAllUserTokens(userId);

	logger.info({userId}, "User logged out from all devices");
}
