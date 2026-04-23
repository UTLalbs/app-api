# hr/positions

Catálogo de puestos per-organización. Reemplaza el enum fijo `EmployeePosition`
que antes vivía en `hr/employees`.

## Colección

`positions` — índices: `orgId_isActive`, `orgId_key_unique`, `orgId_name`.

## Endpoints

Prefijo: `/api/v1/hr/positions` · Requiere `authenticate` + `apiLimiter`.

| Método | Path | RBAC | Descripción |
|---|---|---|---|
| GET    | `/`     | `employees:read`   | Listar puestos (query: `isActive`, `isSystem`). |
| POST   | `/`     | `employees:create` | Crear puesto (body: `name`, `key?`). |
| PATCH  | `/:id`  | `employees:update` | Actualizar `name` y/o `isActive`. |
| DELETE | `/:id`  | `employees:delete` | Eliminar. Solo `isSystem=false` y si no está en uso. |

## Reglas

- `key` único por org. Si no viene en el create, se deriva de `name` con
  snake_case (`"Operador Fronterizo" → "operador_fronterizo"`).
- `isSystem: true` → no se puede renombrar (bloqueado implícitamente en la UI),
  no se puede borrar (guard en repository).
- DELETE con empleados asignados a la key → `409 ConflictError` con mensaje
  indicando cuántos empleados bloquean el borrado.
- Se siembran al crear org vía `initPositionCatalogForOrg(orgId, createdBy)` —
  fire-and-forget desde `organization.service.ts`.

## Seed

Lista fija en `position.seed.ts` (9 entradas: operador fronterizo/nacional,
gerente, mecánico, ejecutivo, guardia, inspector K9, intendencia, mensajero).
Todas entran con `isSystem: true`, `isActive: true`.

## Auditoría

| Trigger | Action | Categoría | Retención |
|---|---|---|---|
| `POST /` | `position_created` | `employees` | 7d |
| `PATCH /:id` | `position_updated` | `employees` | 7d |
| `DELETE /:id` | `position_deleted` | `employees` | 7d |

Updates sin cambios reales no emiten evento (diff vacío).
