# organizations

Tenants del SaaS. Cada organización aísla usuarios, empleados, catálogos y tareas.

## Endpoints

Prefijo: `/api/v1/organizations` · Todos requieren `authenticate`.

| Método | Path | RBAC | Descripción |
|---|---|---|---|
| GET   | `/`    | `users:read`   | Listar organizaciones (super_admin). |
| GET   | `/:id` | `users:read`   | Obtener por id. |
| POST  | `/`    | `users:create` | Registrar nueva org. |
| PATCH | `/:id` | `users:update` | Editar (nombre, settings, timezone). |
| DELETE| `/:id` | `users:delete` | Soft delete. |

> Reutiliza el recurso RBAC `users` para la autorización — no hay un `organizations:*`
> separado. Para agregar, añadir a `Resource` en `role.types.ts` y re-seed.

## Colección

**Colección**: `organizations`

Campos clave: `name`, `slug` (único), `status`, `settings.timezone`, `plan`, `createdAt`.

## Archivos

Patrón estándar: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`,
`*.validator.ts`, `*.types.ts`, `*.model.ts`.

## Reglas de negocio

- `slug` único — generado con `shared/utils/slug.ts` a partir de `name` si no se pasa.
- Al crear una org se inicializa su catálogo de documentos (fire-and-forget).
- Status default = `'active'`.

## Cache

- `org:one:<id>`   — organización individual (TTL LONG).
- `org:list`       — lista completa (TTL MEDIUM).
- `org:tz:<id>`    — timezone para logs y jobs (TTL MEDIUM).

Toda mutación invalida las keys relevantes.
