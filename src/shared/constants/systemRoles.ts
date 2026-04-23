import type { SystemRole } from '../../modules/roles/role.types';

export const SYSTEM_ROLE = {
  SUPER_ADMIN:   'super_admin',
  ORG_ADMIN:     'org_admin',
  DISPATCHER:    'dispatcher',
  DRIVER:        'driver',
  MECHANIC:      'mechanic',
  ACCOUNTANT:    'accountant',
  HR:            'hr',
  MANAGER:       'manager',
  FUEL_MANAGER:  'fuel_manager',
  CLIENT_VIEWER: 'client_viewer',
} as const satisfies Record<string, SystemRole>;
