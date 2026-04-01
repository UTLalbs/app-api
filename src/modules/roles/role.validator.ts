import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────

const actionSchema = z.enum([
  'read',
  'create',
  'update',
  'delete',
  'cancel',
  'export',
  'resolve',
]);

const resourceSchema = z.enum([
  // Operaciones
  'control_board',
  'services',
  // Combustible
  'fuel',
  'fuel_inventory',
  'fuel_scheduling',
  // Mantenimiento
  'maintenance',
  'maintenance_orders',
  'maintenance_inventory',
  // Administración
  'billing',
  'reports',
  'invoices',
  // Nóminas
  'payroll',
  'payroll_employees',
  'payroll_periods',
  // Empleados
  'employees',             
  // Catálogos
  'users',
  'units',
  'trailers',
  'clients',
  'locations',
  'tax_entities',
  // Ajustes
  'settings',
]);

// ── Subdocumentos ──────────────────────────────────────────────────────────

const permissionSchema = z.object({
  resource: resourceSchema,
  actions:  z.array(actionSchema).min(1),
});

// ── Schemas de validación ──────────────────────────────────────────────────

export const createRoleSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos'),
    description:  z.string().min(1).max(200),
    orgId:        z.string().length(24).optional().nullable(),
    permissions:  z.array(permissionSchema).min(1),
  }),
});

export const updateRoleSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos')
      .optional(),
    description:  z.string().min(1).max(200).optional(),
    isActive:     z.boolean().optional(),
    permissions:  z.array(permissionSchema).min(1).optional(),
  }),
});

export const roleIdParamSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;