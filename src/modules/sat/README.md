# sat

Integración con servicios del SAT vía un proveedor externo. Hoy el proveedor
único es **FacturoPorTi**, encapsulado detrás de la interfaz `SatProvider`
para que sea reemplazable sin tocar el resto del módulo.

No persiste en MongoDB — es un wrapper HTTP.

## Endpoints

Prefijo: `/api/v1/sat` · Requiere `authenticate` + `rateLimiter`.

| Método | Path                | Descripción                                       |
| ------ | ------------------- | ------------------------------------------------- |
| GET    | `/postal-code/:cp`  | Datos del CP (estado, municipio, colonias).       |
| POST   | `/validate-rfc`     | Valida un RFC contra el SAT vía el proveedor.     |

> Los catálogos SAT (`c_SubTipoRem`, `c_RegimenFiscal`, etc.) se exponen vía el
> módulo `catalogs/`, que internamente llama a `SatProvider.getCatalog`.

## Estructura

```
sat/
├── sat.controller.ts        Handlers Express
├── sat.routes.ts            Definición de rutas + middlewares
├── sat.service.ts           Operaciones expuestas + helpers de mapeo
├── sat.types.ts             Tipos del dominio
├── sat.validator.ts         Esquemas Zod
├── README.md
└── providers/
    ├── SatProvider.ts            Interfaz agnóstica al vendor
    └── FacturoPortiProvider.ts   Implementación actual
```

El cliente HTTP de FacturoPorTi vive en `infrastructure/http/facturoportiClient.ts`
(separado del módulo). El provider es la única clase que conoce los detalles
del proveedor (claves numéricas de catálogos, shape de respuestas, etc.).

## Sin failover

Hoy hay una sola implementación. Cuando entre un segundo proveedor se diseñará
la política de selección/fallback. Operaciones billables (CFDI, validación RFC)
no deben hacer failover automático para evitar doble cobro.

## Variables de entorno

- `FACTUROPORTI_BASE_URL` — endpoint base del proveedor.
- `FACTUROPORTI_TOKEN` — token Bearer.

## Tests

Para inyectar un mock del provider:

```ts
import {setSatProvider} from "./sat.service";

beforeEach(() => setSatProvider(mockProvider));
afterEach(() => setSatProvider(null));
```
