# tasks

Work items / tickets del equipo (bugs, reportes, asignaciones). Usado por el
sistema para crear tickets automáticos (error_report) y por usuarios para
coordinación.

## Endpoints

Prefijo: `/api/v1/tasks` · Requiere `authenticate` + `rateLimiter`.

| Método | Path | RBAC | Descripción |
|---|---|---|---|
| GET   | `/`    | data-layer | Lista filtrada por ownership (ver más abajo). |
| POST  | `/`    | data-layer | Crear task — el actor queda como `createdBy`. |
| GET   | `/:id` | data-layer | Obtener por id. |
| PATCH | `/:id` | ownership check | Solo creador/asignado/asignador/participante/super_admin. |
| DELETE| `/:id` | `settings:delete` | Solo super_admin / org_admin. |

## Autorización

**Este módulo NO usa `authorize(resource, action)` en la mayoría de rutas**.
La autorización se hace a nivel de datos:

- **GET** filtra en `task.controller.getTasks` vía `accessFilter`:
  - `super_admin` sin impersonar → `area: 'development'`.
  - `super_admin` impersonando → tasks de `impersonating.orgId`.
  - Usuario normal → tasks donde es `assignedBy | assignedTo | participants`.
- **PATCH** valida ownership en `task.service.editTask` (`ForbiddenError` si no).
- **DELETE** requiere `settings:delete` (destructivo).

No está como `Resource` en `role.types.ts` por diseño — si se añade, cambiar también
el seed y el middleware.

## Colección

**Colección**: `tasks`

Campos clave: `orgId`, `type`, `source`, `priority`, `area`, `status`, `createdBy`,
`assignedTo`, `assignedBy`, `participants[]`, `dueDate`, `resolvedAt`, `metadata`.

## Reglas de negocio

- **Dedup**: si `sourceId` ya existe en la colección, se devuelve el task existente
  (no se crea duplicado). Útil para tickets generados por el sistema.
- **Notificaciones**: al crear con `assignedTo`, se notifica al asignado.
  `error_report` o `source: 'system'` notifica también a todos los super_admins.
- **Resolver**: al cambiar a `resolved`, se notifica a `assignedTo`, `assignedBy` y
  `createdBy` + se setea `resolvedAt`.
- **Re-asignar**: al cambiar `assignedTo`, `assignedBy` se actualiza al actor.
- **Prioridad alta**: `critical` o `high` lanza log `warn` con email del developer
  (fire-and-forget — TODO: email real).

## Dependencias

- `notifications.service` — crea notificaciones de asignación y cambio de status.
- `users.repository` — `findSuperAdmins` para broadcast de errores.
- `organizations.model` — populate de `orgName`.
