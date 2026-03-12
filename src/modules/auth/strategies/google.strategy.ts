import { Issuer, generators } from 'openid-client';
import type { Client } from 'openid-client';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { AuthError } from '../../../shared/errors/AppError';
import type { OIDCProfile } from '../auth.types';

const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com';
const SCOPES = 'openid email profile';

let googleClient: Client | null = null;

export async function initGoogleStrategy(): Promise<void> {
  try {
    const issuer = await Issuer.discover(GOOGLE_DISCOVERY_URL);

    googleClient = new issuer.Client({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uris: [env.GOOGLE_REDIRECT_URI],
      response_types: ['code'],
    });

    logger.info('✅  Google OIDC strategy initialized');
  } catch (err) {
    logger.error({ err }, '❌  Failed to initialize Google OIDC strategy');
    throw err;
  }
}

function getGoogleClient(): Client {
  if (!googleClient) {
    throw new AuthError('Google OIDC strategy not initialized');
  }
  return googleClient;
}

// ── Paso 1: Generar URL de autorización ───────────────────────────────────

export function getGoogleAuthorizationUrl(
  state: string,
  codeVerifier: string,
): string {
  const client = getGoogleClient();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  return client.authorizationUrl({
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

// ── Paso 2: Intercambiar code por tokens y extraer perfil ─────────────────

export async function handleGoogleCallback(
  currentUrl: string,
  expectedState: string,
  codeVerifier: string,
): Promise<OIDCProfile> {
  const client = getGoogleClient();

  try {
    const params = client.callbackParams(currentUrl);

    const tokens = await client.callback(
      env.GOOGLE_REDIRECT_URI,
      params,
      {
        state: expectedState,
        code_verifier: codeVerifier,
      },
    );

    const claims = tokens.claims();

    if (!claims.email) {
      throw new AuthError('Email not provided by Google');
    }

    return {
      provider: 'google',
      subjectId: claims.sub,
      email: claims.email,
      displayName: (claims.name as string) ?? claims.email,
      emailVerified: claims.email_verified ?? false,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    logger.error({ err }, 'Google callback failed');
    throw new AuthError('Google authentication failed');
  }
}

// ── PKCE helpers — generados por el controller ─────────────────────────────
// Se exportan para que el controller los use de forma consistente

export function generateState(): string {
  return generators.state();
}

export function generateCodeVerifier(): string {
  return generators.codeVerifier();
}