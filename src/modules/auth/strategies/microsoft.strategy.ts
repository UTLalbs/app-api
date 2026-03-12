import { Issuer, generators } from 'openid-client';
import type { Client } from 'openid-client';

import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { AuthError } from '../../../shared/errors/AppError';
import type { OIDCProfile } from '../auth.types';

// Microsoft soporta single-tenant y multi-tenant
// single-tenant: https://login.microsoftonline.com/{tenantId}/v2.0
// multi-tenant:  https://login.microsoftonline.com/common/v2.0
const MICROSOFT_DISCOVERY_URL = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`;
const SCOPES = 'openid email profile User.Read';

let microsoftClient: Client | null = null;

export async function initMicrosoftStrategy(): Promise<void> {
  try {
    const issuer = await Issuer.discover(MICROSOFT_DISCOVERY_URL);

    microsoftClient = new issuer.Client({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uris: [env.MICROSOFT_REDIRECT_URI],
      response_types: ['code'],
    });

    logger.info('✅  Microsoft OIDC strategy initialized');
  } catch (err) {
    logger.error({ err }, '❌  Failed to initialize Microsoft OIDC strategy');
    throw err;
  }
}

function getMicrosoftClient(): Client {
  if (!microsoftClient) {
    throw new AuthError('Microsoft OIDC strategy not initialized');
  }
  return microsoftClient;
}

// ── Paso 1: Generar URL de autorización ───────────────────────────────────

export function getMicrosoftAuthorizationUrl(
  state: string,
  codeVerifier: string,
): string {
  const client = getMicrosoftClient();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  return client.authorizationUrl({
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

// ── Paso 2: Intercambiar code por tokens y extraer perfil ─────────────────

export async function handleMicrosoftCallback(
  currentUrl: string,
  expectedState: string,
  codeVerifier: string,
): Promise<OIDCProfile> {
  const client = getMicrosoftClient();

  try {
    const params = client.callbackParams(currentUrl);

    const tokens = await client.callback(
      env.MICROSOFT_REDIRECT_URI,
      params,
      {
        state: expectedState,
        code_verifier: codeVerifier,
      },
    );

    const claims = tokens.claims();

    // Microsoft usa 'oid' como identificador único del usuario
    // 'sub' cambia por aplicación — 'oid' es estable
    const oid = claims['oid'] as string | undefined;

    if (!oid) {
      throw new AuthError('OID claim not found in Microsoft token');
    }

    if (!claims.email && !claims.preferred_username) {
      throw new AuthError('Email not provided by Microsoft');
    }

    // Microsoft puede enviar el email en 'email' o 'preferred_username'
    const email = (claims.email ?? claims.preferred_username) as string;

    // Validación de tenant — importante en multi-tenant
    // evita que usuarios de tenants no autorizados accedan
    if (env.MICROSOFT_TENANT_ID !== 'common') {
      const tokenTid = claims['tid'] as string | undefined;
      if (tokenTid !== env.MICROSOFT_TENANT_ID) {
        throw new AuthError('Unauthorized Microsoft tenant');
      }
    }

    return {
      provider: 'microsoft',
      subjectId: oid,
      email: email.toLowerCase(),
      displayName: (claims.name as string) ?? email,
      emailVerified: true, // Microsoft work accounts siempre verifican email
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    logger.error({ err }, 'Microsoft callback failed');
    throw new AuthError('Microsoft authentication failed');
  }
}

// ── PKCE helpers ───────────────────────────────────────────────────────────

export function generateState(): string {
  return generators.state();
}

export function generateCodeVerifier(): string {
  return generators.codeVerifier();
}