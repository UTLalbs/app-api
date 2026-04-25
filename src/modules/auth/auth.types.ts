import type { PermissionScope } from '../roles/role.types';
import type { UserRoleDto } from '../users/user.types';

// ── Autenticación ──────────────────────────────────────────────────────────

export type AuthProvider = 'google' | 'microsoft';

export interface OIDCProfile {
  provider: AuthProvider;
  subjectId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

// ── JWT Payloads ───────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;
  email: string;
  orgId: string | null;          // ← null para super_admin
  userType: string;              // ← nuevo — para detectar super_admin
  roles: UserRoleDto[];
  impersonating?: {              // ← nuevo — presente solo en impersonation
    orgId: string;
    orgName: string;
  } | null;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

// ── Token pair ─────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ── Usuario autenticado en req.user ───────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  orgId: string | null;
  userType: string;
  roles: UserRoleDto[];
  clientId?: string | null;
  impersonating?: {
    orgId: string;
    orgName: string;
  } | null;
  orgTimezone: string;
  userTimezone: string;
  resolvedPermissions: Record<string, string[]>;
  // Scope efectivo del permiso evaluado en el último authorize() de la
  // request. El handler lo consume para filtrar resultados. Si no hay
  // authorize() previo o el permiso es {type: 'all'}, queda en {type: 'all'}.
  permissionScope?: PermissionScope;
}