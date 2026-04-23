# hr/departments

Catálogo de departamentos per-organización. Reemplaza el enum fijo
`EmployeeDepartment` que antes vivía en `hr/employees`.

## Colección

`departments` — índices: `orgId_isActive`, `orgId_key_unique`, `orgId_name`.

## Endpoints

Prefijo: `/api/v1/hr/departments` · Requiere `authenticate` + `apiLimiter`.

| Método | Path | RBAC | Descripción |
|---|---|---|---|
| GET    | `/`     | `employees:read`   | Listar departamentos (query: `isActive`, `isSystem`). |
| POST   | `/`     | `employees:create` | Crear departamento (body: `name`, `key?`). |
| PATCH  | `/:id`  | `employees:update` | Actualizar `name` y/o `isActive`. |
| DELETE | `/:id`  | `employees:delete` | Eliminar. Solo `isSystem=false` y si no está en uso. |

## Reglas

- `key` único por org. Se deriva de `name` con snake_case si no viene.
- `isSystem: true` → no se puede borrar.
- DELETE con empleados asignados → `409 ConflictError`.
- Se siembran al crear org vía `initDepartmentCatalogForOrg(orgId, createdBy)`
  desde `organization.service.ts`.

## Seed

Lista fija en `department.seed.ts` (6 entradas: administración, contabilidad,
mantenimiento, operaciones, recursos humanos, seguridad).

## Auditoría

| Trigger | Action | Categoría | Retención |
|---|---|---|---|
| `POST /` | `department_created` | `employees` | 7d |
| `PATCH /:id` | `department_updated` | `employees` | 7d |
| `DELETE /:id` | `department_deleted` | `employees` | 7d |
