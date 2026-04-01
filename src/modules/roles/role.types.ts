import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type Action =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'export'
  | 'resolve';

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
  // Empleados
  | 'employees'             
  // Catálogos
  | 'users'
  | 'units'
  | 'trailers'
  | 'clients'
  | 'locations'
  | 'tax_entities'
  // Ajustes
  | 'settings';
// ── Subdocumentos ──────────────────────────────────────────────────────────

export interface Permission {
  resource: Resource;
  actions: Action[];
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface RoleDocument {
  _id: ObjectId;
  orgId: ObjectId | null;
  name: string;
  description: string;
  isSystem: boolean;
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
  isActive: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Roles del sistema ──────────────────────────────────────────────────────

export const SystemRoles = {
  SUPER_ADMIN:    'super_admin',
  ORG_ADMIN:      'org_admin',
  DISPATCHER:     'dispatcher',
  DRIVER:         'driver',
  MECHANIC:       'mechanic',
  ACCOUNTANT:     'accountant',
  HR:             'hr',
  MANAGER:        'manager',
  FUEL_MANAGER:   'fuel_manager',
  CLIENT_VIEWER:  'client_viewer',
} as const;

export type SystemRole = typeof SystemRoles[keyof typeof SystemRoles];

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