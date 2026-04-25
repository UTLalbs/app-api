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
  'correct',
  'exclude',
  'edit_shifts',
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
  // Recursos Humanos
  'hr_dashboard',
  'employees',
  'time_clocks',
  'schedules',
  // Configuración HR
  'hr_document_catalog',
  'hr_document_profiles',
  'hr_positions',
  'hr_departments',
  // Catálogos
  'users',
  'units',
  'trailers',
  'clients',
  'locations',
  'tax_entities',
  // Ajustes
  'settings',
  // Auditoría
  'audit',
]);

// ── Scope ──────────────────────────────────────────────────────────────────

const objectIdSchema = z.string().length(24, 'ObjectId inválido');

const scopeFiltersSchema = z
  .object({
    departmentKeys: z.array(z.string().min(1)).optional(),
    positionKeys: z.array(z.string().min(1)).optional(),
    locationIds: z.array(objectIdSchema).optional(),
  })
  .refine(
    (filters) => {
      const counts = [
        filters.departmentKeys?.length ?? 0,
        filters.positionKeys?.length ?? 0,
        filters.locationIds?.length ?? 0,
      ];
      // Al menos una dimensión con elementos.
      const totalNonEmpty = counts.filter((n) => n > 0).length;
      // Una sola dimensión por entrada (ver sección 4 del plan).
      return totalNonEmpty === 1;
    },
    {
      message:
        'El scope custom debe especificar exactamente una dimensión (departamento, puesto o ubicación)',
    },
  );

const permissionScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('team') }),
  z.object({ type: z.literal('self') }),
  z.object({ type: z.literal('custom'), filters: scopeFiltersSchema }),
]);

// ── Subdocumentos ──────────────────────────────────────────────────────────

const permissionSchema = z.object({
  resource: resourceSchema,
  actions:  z.array(actionSchema).min(1),
  scope:    permissionScopeSchema.optional(),
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
