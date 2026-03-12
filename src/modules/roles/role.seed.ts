import { logger } from '../../config/logger';

import { getRoleCollection } from './role.model';
import type { Permission, RoleDocument } from './role.types';

// ── Definición de permisos por recurso ────────────────────────────────────

const ALL_ACTIONS = ['read', 'write', 'delete', 'admin'] as const;
const READ_WRITE = ['read', 'write'] as const;
const READ_ONLY = ['read'] as const;

function p(resource: string, actions: readonly string[]): Permission {
  return { resource, actions: actions as Permission['actions'] };
}

// ── Definición de roles del sistema ───────────────────────────────────────

const SYSTEM_ROLES: Omit<RoleDocument, '_id' | 'createdAt' | 'updatedAt'>[] = [
  // ── Super Admin ──────────────────────────────────────────────────────────
  {
    name: 'super_admin',
    description: 'Acceso total al sistema',
    orgId: null,
    isSystem: true,
    permissions: [
      p('services', ALL_ACTIONS),
      p('freights', ALL_ACTIONS),
      p('tracking', ALL_ACTIONS),
      p('units', ALL_ACTIONS),
      p('trailers', ALL_ACTIONS),
      p('drivers', ALL_ACTIONS),
      p('clients', ALL_ACTIONS),
      p('locations', ALL_ACTIONS),
      p('hr', ALL_ACTIONS),
      p('payroll', ALL_ACTIONS),
      p('billing', ALL_ACTIONS),
      p('maintenance', ALL_ACTIONS),
      p('fuel', ALL_ACTIONS),
      p('inventory', ALL_ACTIONS),
      p('users', ALL_ACTIONS),
      p('roles', ALL_ACTIONS),
      p('organizations', ALL_ACTIONS),
      p('reports', ALL_ACTIONS),
      p('settings', ALL_ACTIONS),
    ],
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  {
    name: 'admin',
    description: 'Administrador de la organización',
    orgId: null,
    isSystem: true,
    permissions: [
      p('services', ALL_ACTIONS),
      p('freights', ALL_ACTIONS),
      p('tracking', ALL_ACTIONS),
      p('units', ALL_ACTIONS),
      p('trailers', ALL_ACTIONS),
      p('drivers', ALL_ACTIONS),
      p('clients', ALL_ACTIONS),
      p('locations', ALL_ACTIONS),
      p('hr', ALL_ACTIONS),
      p('payroll', ALL_ACTIONS),
      p('billing', ALL_ACTIONS),
      p('maintenance', ALL_ACTIONS),
      p('fuel', ALL_ACTIONS),
      p('inventory', ALL_ACTIONS),
      p('users', ['read', 'write', 'delete']),
      p('roles', ['read', 'write']),
      p('reports', ALL_ACTIONS),
      p('settings', ['read', 'write']),
    ],
  },

  // ── Operaciones ──────────────────────────────────────────────────────────
  {
    name: 'operaciones',
    description: 'Gestión de servicios y operaciones de transporte',
    orgId: null,
    isSystem: true,
    permissions: [
      p('services', READ_WRITE),
      p('freights', READ_WRITE),
      p('tracking', READ_ONLY),
      p('units', READ_ONLY),
      p('trailers', READ_ONLY),
      p('drivers', READ_ONLY),
      p('clients', READ_ONLY),
      p('locations', READ_ONLY),
      p('reports', READ_ONLY),
    ],
  },

  // ── Mantenimiento ────────────────────────────────────────────────────────
  {
    name: 'mantenimiento',
    description: 'Gestión de mantenimiento, combustible e inventario',
    orgId: null,
    isSystem: true,
    permissions: [
      p('units', READ_WRITE),
      p('trailers', READ_WRITE),
      p('maintenance', READ_WRITE),
      p('fuel', READ_WRITE),
      p('inventory', READ_WRITE),
      p('reports', READ_ONLY),
    ],
  },

  // ── Administración ───────────────────────────────────────────────────────
  {
    name: 'administracion',
    description: 'Recursos humanos, nóminas y facturación',
    orgId: null,
    isSystem: true,
    permissions: [
      p('hr', READ_WRITE),
      p('payroll', READ_WRITE),
      p('billing', READ_WRITE),
      p('reports', READ_ONLY),
      p('users', READ_ONLY),
    ],
  },

  // ── Cliente ──────────────────────────────────────────────────────────────
  // Solo ve sus propios servicios y fletes — filtro por clientId en queries
  {
    name: 'cliente',
    description: 'Cliente externo — acceso solo a sus propios datos',
    orgId: null,
    isSystem: true,
    permissions: [
      p('services', READ_ONLY),
      p('freights', READ_ONLY),
      p('tracking', READ_ONLY),
    ],
  },

  // ── Driver ───────────────────────────────────────────────────────────────
  // Reservado para app móvil — permisos mínimos
  {
    name: 'driver',
    description: 'Operador — acceso desde app móvil',
    orgId: null,
    isSystem: true,
    permissions: [
      p('services', READ_ONLY),
      p('tracking', ['read', 'write']),  // puede actualizar su ubicación
    ],
  },
];

// ── Función de seed ───────────────────────────────────────────────────────
// Usa upsert — si el rol ya existe lo actualiza, si no lo crea
// Seguro de correr múltiples veces

export async function seedRoles(): Promise<void> {
  const collection = getRoleCollection();
  const now = new Date();

  let created = 0;
  let updated = 0;

  for (const role of SYSTEM_ROLES) {
    const result = await collection.updateOne(
      { name: role.name, isSystem: true },
      {
        $set: {
          ...role,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  logger.info(
    { created, updated, total: SYSTEM_ROLES.length },
    '✅  Role seed complete',
  );
}