export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  roles: string[];
  resolvedPermissions: ResolvedPermission[];
}

export interface ResolvedPermission {
  resource: string;
  actions: string[];
}

export type AuthProvider = 'google' | 'microsoft' | 'local';