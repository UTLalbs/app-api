import type { PositionSeedItem } from './position.types';

// Se inserta en cada org nueva vía `initPositionCatalogForOrg`. Orden alfabético
// por name — los endpoints ya retornan sorted así.
export const POSITION_SEED: PositionSeedItem[] = [
  { name: 'Ejecutivo',              key: 'executive'       },
  { name: 'Gerente',                key: 'manager'         },
  { name: 'Guardia de Seguridad',   key: 'security_guard'  },
  { name: 'Inspector K9',           key: 'k9_inspector'    },
  { name: 'Intendencia',            key: 'janitor'         },
  { name: 'Mecánico',               key: 'mechanic'        },
  { name: 'Mensajero',              key: 'messenger'       },
  { name: 'Operador Fronterizo',    key: 'border_driver'   },
  { name: 'Operador Nacional',      key: 'national_driver' },
];
