# users

CRUD de usuarios del sistema. Incluye staff interno, contactos de cliente y super admins.

## Endpoints

Prefijo: `/api/v1/users` · Todos requieren `authenticate`.

| Método | Path | RBAC | Descripción |
|---|---|---|---|
| GET   | `/`          | `users:read`   | Listar (paginado + filtros). |
| GET   | `/:id`       | `users:read`   | Obtener por id. |
| POST  | `/`          | `users:create` | Crear usuario. |
| PATCH | `/:id`       | `users:update` | Editar (displayName, phones, roles, etc.). |
| PATCH | `/:id/status`| `users:update` | Cambiar status (pending/active/inactive/suspended). |
| DELETE| `/:id`       | `users:delete` | Soft delete (`deletedAt`). |

## Colección y dominio

**Colección**: `users`

Este módulo es el núcleo de identidad. Otros dominios viven como subdocumentos:
- `employeeProfile` — gestionado por `hr/employees`.
- `clientMemberships` — membresías como contacto de cliente.
- `identities.google/microsoft/local` — providers OIDC + password local (opcional).
- `roles[]` — referencias a `roles` collection (IDs + name).

## Archivos

- `user.routes.ts`, `user.controller.ts`, `user.service.ts`, `user.repository.ts`,
  `user.validator.ts`, `user.types.ts`, `user.model.ts`.

## Reglas de negocio

- `email` siempre en minúsculas al crear.
- `status` default al crear = `USER_STATUS.PENDING`.
- Soft delete: nunca `deleteOne`, siempre `deletedAt: Date + status: 'inactive'`.
- Proyección `BASE_PROJECTION` excluye campos sensibles (`identities.local.passwordHash`, etc).

## Dependencias

- Usado por casi todos los módulos — es el hub.
- `auth` busca/crea usuarios aquí.
- `hr/employees` lee/escribe `employeeProfile`.
- `tasks`, `notifications` referencian `userId`.

## Auditoría

| Acción | Trigger | Retención |
|---|---|---|
| `user_created` | `POST /` | 7d |
| `user_updated` | `PATCH /:id` | 7d |
| `user_deleted` | `DELETE /:id` (soft delete) | 7d |
| `user_status_changed` | `PATCH /:id/status` | 180d |
| `user_role_assigned` | cambio de `roles[]` en update | 180d |
| `user_read` | `GET /:id` **si `actor.id !== target.id`** | 7d |

- **Self-reads** (cuando un user consulta su propio detalle, típicamente desde
  el endpoint `GET /me` o al refrescar el perfil) **no se auditan** — solo las
  lecturas cross-actor (un super_admin viendo a otro user, por ejemplo).
- La entrada auditada del service es `readUserDetail(id, orgId, context)`.
  `getUserById(id, orgId)` sigue existiendo como lectura interna sin emit
  (la usan `authenticate`, `authorize` y el cache de permisos) — no la
  expongas directamente desde un controller HTTP.

Detalle de retención, contrato del evento y endpoints del dashboard en
`src/modules/audit/README.md`.
