import { logger } from '../../config/logger';

import { getRoleCollection } from './role.model';
import type { Action, Permission, Resource, RoleDocument } from './role.types';

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_ACTIONS: Action[] = ['read', 'create', 'update', 'delete', 'cancel', 'export', 'resolve'];
const READ_ONLY:   Action[] = ['read'];
const FULL_CRUD:   Action[] = ['read', 'create', 'update', 'delete'];

function p(resource: Resource, actions: Action[]): Permission {
  return { resource, actions };
}

// ── Definición de roles del sistema ───────────────────────────────────────

const SYSTEM_ROLES: Omit<RoleDocument, '_id' | 'createdAt' | 'updatedAt'>[] = [

  // ── Super Admin ──────────────────────────────────────────────────────────
  {
    name: 'super_admin',
    description: 'Dueño del SaaS — acceso total a todos los tenants',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('users',    ALL_ACTIONS),
      p('roles',    ALL_ACTIONS),
      p('orders',   ALL_ACTIONS),
      p('trips',    ALL_ACTIONS),
      p('fleet',    ALL_ACTIONS),
      p('tracking', ALL_ACTIONS),
      p('invoices', ALL_ACTIONS),
      p('reports',  ALL_ACTIONS),
      p('fuel',     ALL_ACTIONS),
      p('payroll',  ALL_ACTIONS),
      p('clients',  ALL_ACTIONS),
      p('alerts',   ALL_ACTIONS),
    ],
  },

  // ── Org Admin ────────────────────────────────────────────────────────────
  {
    name: 'org_admin',
    description: 'Administrador del tenant — acceso total dentro de su organización',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('users',    FULL_CRUD),
      p('roles',    FULL_CRUD),
      p('orders',   ALL_ACTIONS),
      p('trips',    ALL_ACTIONS),
      p('fleet',    FULL_CRUD),
      p('tracking', ALL_ACTIONS),
      p('invoices', ALL_ACTIONS),
      p('reports',  ['read', 'export']),
      p('fuel',     FULL_CRUD),
      p('payroll',  FULL_CRUD),
      p('clients',  FULL_CRUD),
      p('alerts',   ALL_ACTIONS),
    ],
  },

  // ── Dispatcher ───────────────────────────────────────────────────────────
  {
    name: 'dispatcher',
    description: 'Coordinador de viajes — gestión de órdenes, viajes y GPS',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('orders',   ['read', 'create', 'update', 'cancel']),
      p('trips',    ['read', 'create', 'update', 'cancel']),
      p('fleet',    READ_ONLY),
      p('tracking', ['read']),
      p('clients',  READ_ONLY),
      p('alerts',   ['read', 'resolve']),
      p('reports',  READ_ONLY),
    ],
  },

  // ── Driver ───────────────────────────────────────────────────────────────
  {
    name: 'driver',
    description: 'Operador / Chofer — sus viajes y GPS propio desde app móvil',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('trips',    ['read', 'update']),
      p('tracking', ['read', 'create', 'update']),
      p('alerts',   ['read']),
    ],
  },

  // ── Mechanic ─────────────────────────────────────────────────────────────
  {
    name: 'mechanic',
    description: 'Mecánico — gestión de flotilla y lectura de combustible',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('fleet',    ['read', 'create', 'update']),
      p('fuel',     READ_ONLY),
      p('alerts',   ['read', 'resolve']),
      p('reports',  READ_ONLY),
    ],
  },

  // ── Accountant ───────────────────────────────────────────────────────────
  {
    name: 'accountant',
    description: 'Contador — facturación completa y reportes',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('invoices', ALL_ACTIONS),
      p('reports',  ['read', 'export']),
      p('clients',  READ_ONLY),
      p('orders',   READ_ONLY),
    ],
  },

  // ── HR ───────────────────────────────────────────────────────────────────
  {
    name: 'hr',
    description: 'Recursos Humanos — empleados y nómina',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('users',   FULL_CRUD),
      p('payroll', ALL_ACTIONS),
      p('reports', READ_ONLY),
    ],
  },

  // ── Manager ──────────────────────────────────────────────────────────────
  {
    name: 'manager',
    description: 'Gerente — solo lectura de reportes y KPIs',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('orders',   READ_ONLY),
      p('trips',    READ_ONLY),
      p('fleet',    READ_ONLY),
      p('tracking', READ_ONLY),
      p('invoices', READ_ONLY),
      p('reports',  ['read', 'export']),
      p('fuel',     READ_ONLY),
      p('clients',  READ_ONLY),
      p('alerts',   READ_ONLY),
    ],
  },

  // ── Fuel Manager ─────────────────────────────────────────────────────────
  {
    name: 'fuel_manager',
    description: 'Jefe de Combustible — tanques, despacho y transacciones',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('fuel',    ALL_ACTIONS),
      p('fleet',   READ_ONLY),
      p('reports', READ_ONLY),
      p('alerts',  ['read', 'resolve']),
    ],
  },

  // ── Client Viewer ────────────────────────────────────────────────────────
  {
    name: 'client_viewer',
    description: 'Contacto cliente — portal externo, solo sus datos',
    orgId: null,
    isSystem: true,
    isActive: true,
    permissions: [
      p('orders',   READ_ONLY),
      p('tracking', READ_ONLY),
      p('invoices', ['read', 'export']),
    ],
  },
];

// ── Función de seed ───────────────────────────────────────────────────────

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