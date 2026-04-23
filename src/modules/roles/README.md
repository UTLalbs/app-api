# roles

Sistema RBAC: roles agrupan permisos `resource:action`. El middleware `authorize()`
consulta el rol del usuario y verifica acceso.

## Endpoints

Prefijo: `/api/v1/roles` · Requiere `authenticate` + `rateLimiter`.

Ver `role.routes.ts` para la lista concreta de operaciones CRUD.

## Colección

**Colección**: `roles`

Documento clave:
```ts
{ name, description, orgId, isSystem, isActive, permissions: [{resource, actions[]}] }
```

## Roles del sistema (seed)

Siembra automática al arranque — ver `role.seed.ts`:

- `super_admin` — dueño del SaaS (bypass en middleware).
- `org_admin`, `dispatcher`, `driver`, `mechanic`, `accountant`, `hr`, `manager`,
  `fuel_manager`, `client_viewer`.

Cada rol declara sus `permissions` como array de `{resource, actions}`.

## Tipos

`Action`, `Resource`, `SystemRole` definidos en `role.types.ts`. Son la **fuente de
verdad** para `authorize(resource, action)` y constants en `shared/constants/systemRoles.ts`.

## Reglas de negocio

- No se pueden eliminar roles `isSystem: true`.
- Cambiar permisos de un rol invalida el cache `auth:permissions:*` de todos los
  usuarios que lo tengan.
- `orgId: null` = rol global (del sistema o compartido).

## Cache

- `auth:permissions:<userId>` — permisos resueltos de un user (TTL 5 min).
  Invalidar con `invalidatePermissionsCache(userId)` al cambiar roles del user.
