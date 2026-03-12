import type { ObjectId } from 'mongodb';

// ── Documento en MongoDB ───────────────────────────────────────────────────
export interface RoleDocument {
  _id: ObjectId;
  name: string;
  description: string;
  orgId: ObjectId | null;
  isSystem: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────
export interface Role {
  id: string;
  name: string;
  description: string;
  orgId: string | null;
  isSystem: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Permisos ───────────────────────────────────────────────────────────────
export interface Permission {
  resource: string;
  actions: Action[];
}

export type Action = 'read' | 'write' | 'delete' | 'admin';

// ── Roles del sistema ──────────────────────────────────────────────────────
export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  OPERACIONES: 'operaciones',
  MANTENIMIENTO: 'mantenimiento',
  ADMINISTRACION: 'administracion',
  CLIENTE: 'cliente',
  DRIVER: 'driver',
} as const;

export type SystemRole = typeof SystemRoles[keyof typeof SystemRoles];

// ── DTOs ───────────────────────────────────────────────────────────────────
export interface CreateRoleDto {
  name: string;
  description: string;
  orgId?: string | null;
  permissions: Permission[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: Permission[];
}