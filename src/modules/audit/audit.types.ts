import type { ObjectId } from 'mongodb';

// ── Categorías de eventos ──────────────────────────────────────────────────
export type AuditCategory =
  | 'auth'        // login, logout, token refresh
  | 'users'       // create, update, delete, status change
  | 'roles'       // create, update, delete, assign
  | 'organizations'
  | 'system';     // seed, startup, config changes

// ── Acciones por categoría ─────────────────────────────────────────────────
export type AuditAction =
  // auth
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'token_refreshed'
  // users
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_status_changed'
  | 'user_role_assigned'
  // roles
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  // organizations
  | 'org_created'
  | 'org_updated'
  | 'org_deleted'
  // system
  | 'system_seed'
  | 'system_startup';

// ── Documento en MongoDB ───────────────────────────────────────────────────
export interface AuditDocument {
  _id: ObjectId;
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActor;         // quién realizó la acción
  target?: AuditTarget;      // sobre qué entidad
  metadata?: Record<string, unknown>;  // datos adicionales
  ip?: string;
  userAgent?: string;
  orgId?: ObjectId;
  createdAt: Date;
}

export interface AuditActor {
  id: string;
  email: string;
  displayName: string;
}

export interface AuditTarget {
  type: string;   // 'user', 'role', 'organization'
  id: string;
  displayName?: string;
}

// ── DTO para crear un evento ───────────────────────────────────────────────
export interface CreateAuditDto {
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  orgId?: string;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────
export interface AuditEvent {
  id: string;
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  orgId?: string;
  createdAt: Date;
}

// ── Filtros para consultas ─────────────────────────────────────────────────
export interface AuditQueryFilter {
  category?: AuditCategory;
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
  orgId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}