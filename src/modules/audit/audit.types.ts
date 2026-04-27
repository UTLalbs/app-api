import type { ObjectId } from 'mongodb';

// ── Categorías de eventos ──────────────────────────────────────────────────
export type AuditCategory =
  | 'auth'           // login, logout, token refresh
  | 'users'          // create, update, delete, status change
  | 'roles'          // create, update, delete, permissions
  | 'organizations'
  | 'tasks'
  | 'employees'
  | 'schedules'      // plantillas de turnos + asignaciones
  | 'catalogs'       // locations, units, trailers, clients, etc.
  | 'documents'      // catalog + profiles + uploads
  | 'reads'          // lecturas sensibles (PII, URLs S3 firmadas)
  | 'system';        // seed, startup, config changes

// ── Acciones por categoría ─────────────────────────────────────────────────
export type AuditAction =
  // auth
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'token_refreshed'
  | 'impersonation_start'
  | 'impersonation_exit'
  // users
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_status_changed'
  | 'user_role_assigned'
  | 'user_read'
  // roles
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'role_permissions_changed'
  // organizations
  | 'org_created'
  | 'org_updated'
  | 'org_deleted'
  // tasks
  | 'task_created'
  | 'task_updated'
  | 'task_resolved'
  | 'task_deleted'
  | 'task_reassigned'
  // employees
  | 'employee_created'
  | 'employee_updated'
  | 'employee_deleted'
  | 'employee_status_changed'
  | 'employee_pii_updated'
  // catalogs de RH (puestos y departamentos)
  | 'position_created'
  | 'position_updated'
  | 'position_deleted'
  | 'department_created'
  | 'department_updated'
  | 'department_deleted'
  // catálogo transversal: locations
  | 'location_created'
  | 'location_updated'
  | 'location_deleted'
  | 'location_fiscal_validated'
  // schedules (programación de turnos)
  | 'template_created'
  | 'template_updated'
  | 'template_deleted'
  | 'schedule_created'
  | 'schedule_updated'
  | 'schedule_deleted'
  // documents
  | 'doc_catalog_item_created'
  | 'doc_catalog_item_updated'
  | 'doc_catalog_item_deleted'
  | 'doc_profile_created'
  | 'doc_profile_updated'
  | 'doc_profile_deleted'
  | 'employee_document_uploaded'
  | 'employee_document_updated'
  | 'employee_document_deleted'
  // reads (sensibles)
  | 'employee_pii_read'
  | 'employee_document_url_issued'
  | 'employee_checklist_read'
  // system
  | 'system_seed'
  | 'system_startup';

// ── Retención ──────────────────────────────────────────────────────────────

export const RETENTION_DAYS = {
  SHORT: 7,    // default
  LONG:  180,  // sensibles / importantes (6 meses)
} as const;

// Acciones que viven 6 meses (compliance / investigación).
// Todo lo demás vive 7 días.
export const SENSITIVE_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  // auth sensibles
  'login_failed',
  'impersonation_start',
  'impersonation_exit',
  // permisos y roles
  'user_role_assigned',
  'role_updated',
  'role_deleted',
  'role_permissions_changed',
  // status críticos
  'user_status_changed',
  'org_deleted',
  'employee_deleted',
  'employee_status_changed',
  // PII
  'employee_pii_updated',
  'employee_pii_read',
  'employee_document_url_issued',
  'employee_document_uploaded',
  'employee_document_updated',
  'employee_document_deleted',
]);

export function getRetentionDays(action: AuditAction): number {
  return SENSITIVE_ACTIONS.has(action)
    ? RETENTION_DAYS.LONG
    : RETENTION_DAYS.SHORT;
}

// ── Diff ───────────────────────────────────────────────────────────────────

export interface DiffEntry {
  old: unknown;
  new: unknown;
  isMasked?: boolean;
}

export type AuditDiff = Record<string, DiffEntry>;

// ── Contexto de request propagado desde el controller ─────────────────────

export interface AuditActorContext {
  id: string;
  email: string;
  displayName: string;
  userType: string;
}

export interface AuditContext {
  actor: AuditActorContext | null;   // null cuando el caller es el sistema (jobs, seeds)
  orgId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
  impersonating: { orgId: string; orgName: string } | null;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────
// Los IDs (actor.id, target.id, orgId, impersonating.orgId) se guardan como
// ObjectId para uniformidad con el resto de colecciones y para que los índices
// sean más compactos. El repository convierte a string al mapear a AuditEvent.

export interface AuditActorDocument {
  id: ObjectId;
  email: string;
  displayName: string;
}

export interface AuditTargetDocument {
  type: string;            // 'user', 'role', 'organization', 'task', 'employee', ...
  id: ObjectId;
  displayName?: string;
}

export interface AuditDocument {
  _id: ObjectId;
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActorDocument;
  target?: AuditTargetDocument;
  diff?: AuditDiff;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  orgId?: ObjectId;
  requestId?: string;
  impersonating?: { orgId: ObjectId; orgName: string };
  createdAt: Date;
  expiresAt: Date;   // usado por TTL index
}

// ── Dominio (como lo ve el service/controller/JSON response) ───────────────

export interface AuditActor {
  id: string;
  email: string;
  displayName: string;
}

export interface AuditTarget {
  type: string;
  id: string;
  displayName?: string;
}

// ── DTO para crear un evento ───────────────────────────────────────────────
export interface CreateAuditDto {
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  diff?: AuditDiff;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  orgId?: string | null;
  requestId?: string;
  impersonating?: { orgId: string; orgName: string } | null;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────
export interface AuditEvent {
  id: string;
  category: AuditCategory;
  action: AuditAction;
  actor: AuditActor;
  target?: AuditTarget;
  diff?: AuditDiff;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  orgId?: string;
  requestId?: string;
  impersonating?: { orgId: string; orgName: string };
  createdAt: Date;
  expiresAt: Date;
}

// ── Filtros para consultas ─────────────────────────────────────────────────
export interface AuditQueryFilter {
  category?: AuditCategory;
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
  targetType?: string;
  orgId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}
