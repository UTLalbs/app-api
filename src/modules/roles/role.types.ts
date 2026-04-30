import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type Action =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'export'
  | 'resolve'
  // Acciones específicas de fichajes y schedules
  | 'correct'
  | 'exclude'
  | 'edit_shifts'
  // Acciones específicas de ausencias
  | 'approve';

export type Resource =
  // Operaciones
  | 'control_board'
  | 'services'
  // Combustible
  | 'fuel'
  | 'fuel_inventory'
  | 'fuel_scheduling'
  // Mantenimiento
  | 'maintenance'
  | 'maintenance_orders'
  | 'maintenance_inventory'
  // Administración
  | 'billing'
  | 'reports'
  | 'invoices'
  // Nóminas
  | 'payroll'
  | 'payroll_employees'
  | 'payroll_periods'
  // Recursos Humanos
  | 'hr_dashboard'
  | 'employees'
  | 'time_clocks'
  | 'schedules'
  | 'absences'
  // Configuración de RRHH (sub-catálogos)
  | 'hr_document_catalog'
  | 'hr_document_profiles'
  | 'hr_positions'
  | 'hr_departments'
  | 'absence_categories'
  // Catálogos
  | 'users'
  | 'units'
  | 'trailers'
  | 'clients'
  | 'locations'
  | 'tax_entities'
  // Ajustes
  | 'settings'
  // Auditoría
  | 'audit';

// ── Scope (alcance de empleados que ve el rol) ─────────────────────────────

export interface ScopeFilters {
  departmentKeys?: string[];
  positionKeys?: string[];
  locationIds?: string[];
}

export type PermissionScope =
  | { type: 'all' }
  | { type: 'team' }
  | { type: 'self' }
  | { type: 'custom'; filters: ScopeFilters };

// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface Permission {
  resource: Resource;
  actions: Action[];
  // Si está ausente, se interpreta como { type: 'all' } (retrocompatibilidad).
  scope?: PermissionScope;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface RoleDocument {
  _id: ObjectId;
  orgId: ObjectId | null;
  name: string;
  description: string;
  isSystem: boolean;
  isOrgAdmin: boolean;
  isActive: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Role {
  id: string;
  orgId: string | null;
  name: string;
  description: string;
  isSystem: boolean;
  isOrgAdmin: boolean;
  isActive: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateRoleDto {
  name: string;
  description: string;
  orgId?: string | null;
  permissions: Permission[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissions?: Permission[];
}