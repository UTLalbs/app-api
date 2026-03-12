export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  roles: string[];
  clientId?: string | null;
  resolvedPermissions: Record<string, string[]>;
}

export interface ResolvedPermission {
  resource: string;
  actions: string[];
}

export type AuthProvider = 'google' | 'microsoft' | 'local';

export interface OIDCProfile {
  provider: AuthProvider;
  subjectId: string;      // sub (Google) o oid (Microsoft)
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;           // userId
  email: string;
  orgId: string;
  roles: string[];
}

export interface RefreshTokenPayload {
  sub: string;           // userId
  jti: string;           // JWT ID — identifica este refresh token en Redis
}