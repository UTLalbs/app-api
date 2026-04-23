import type { DepartmentSeedItem } from './department.types';

// Orden alfabético por name (consistente con el sort de los endpoints).
export const DEPARTMENT_SEED: DepartmentSeedItem[] = [
  { name: 'Administración',    key: 'administration'  },
  { name: 'Contabilidad',      key: 'accounting'      },
  { name: 'Mantenimiento',     key: 'maintenance'     },
  { name: 'Operaciones',       key: 'operations'      },
  { name: 'Recursos Humanos',  key: 'human_resources' },
  { name: 'Seguridad',         key: 'security'        },
];
