# auth

Autenticación SSO (Google, Microsoft OIDC), manejo de sesión JWT en cookies y
impersonation para `super_admin`.

## Endpoints

Prefijo: `/api/v1/auth`

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET  | `/google`             | público | Inicia flujo OIDC — redirige a Google. |
| GET  | `/google/callback`    | público | Callback de Google — setea cookies y redirige al frontend. |
| GET  | `/microsoft`          | público | Inicia flujo OIDC con Microsoft. |
| GET  | `/microsoft/callback` | público | Callback de Microsoft. |
| POST | `/refresh`            | cookie `refresh_token` | Rota el par access/refresh. |
| POST | `/logout`             | público (tolera token expirado) | Limpia cookies, revoca el refresh token actual y emite audit. |
| POST | `/logout-all`         | access_token | Revoca TODOS los refresh tokens del usuario y emite audit. |
| GET  | `/me`                 | access_token | Devuelve `req.user` actual. |
| POST | `/impersonate/:orgId` | access_token (super_admin) | Emite token con contexto impersonado (TTL 8h). |
| POST | `/impersonate/exit`   | access_token | Sale del modo impersonación. |

## Flujo

1. **Login**: frontend redirige a `/google` → Google autentica → callback.
2. En el callback se busca/crea el user vía `loginWithOIDC` en `auth.service`.
3. Se emiten `access_token` (15 min) y `refresh_token` (30 días) como **cookies http-only**.
4. El frontend consume `access_token` automáticamente. Al 401 llama `/refresh`.
5. **Refresh** rota ambos tokens (refresh token rotation — el anterior se marca usado).

## PKCE

El state + codeVerifier se guardan en Redis con TTL de 10 min (`auth:pkce:<state>`).
Se eliminan tras canje exitoso.

## Colecciones y dependencias

- No tiene repository propio — opera sobre **`users`** vía `user.repository`.
- Guarda refresh tokens vía `tokens.service` (colección `tokens`).
- Escribe eventos en **`audit_logs`** vía `audit.service`.

## Archivos

- `auth.routes.ts` — monta endpoints públicos + impersonate.
- `auth.controller.ts` — handlers OIDC, maneja cookies y redirects.
- `auth.service.ts` — `loginWithOIDC`, `refreshSession`, `logout`, `logoutAllDevices`.
- `auth.types.ts` — `OIDCProfile`, `AccessTokenPayload`, `TokenPair`.
- `auth.validator.ts` — esquemas Zod para impersonation.
- `token.service.ts` — emisión/verificación JWT + cookie options.
- `impersonate.controller.ts` — inicio/salida de impersonation.
- `strategies/google.strategy.ts`, `strategies/microsoft.strategy.ts` — cliente OIDC.

## Reglas de negocio clave

- El email debe estar verificado por el IdP (`profile.emailVerified`).
- Usuarios `inactive` o `suspended` no pueden iniciar sesión (`ForbiddenError`).
- Usuarios `pending` sí pueden loguearse (se loguea warn para visibility).
- Al hacer refresh se revoca el refresh token previo (rotación obligatoria).
- `/logout` es público (sin `authenticate`) para permitir cerrar sesiones con
  access token expirado. El controller resuelve la identidad del actor en 3
  intentos: verify del `refresh_token` → decode sin verify del `access_token`
  → `findUserById` para poblar el `AuditContext.actor`. Así el evento `logout`
  se emite con actor completo (email, displayName, impersonating si aplicaba)
  aunque el access cookie haya caducado.

## Auditoría

Acciones emitidas por este módulo (detalle de retención y contrato en
`src/modules/audit/README.md`):

| Acción | Trigger | Retención |
|---|---|---|
| `login_success` | OIDC callback exitoso | 7d |
| `login_failed` | Rechazo de login (email no verificado, cuenta deshabilitada) | 180d |
| `logout` | `POST /logout` | 7d |
| `logout_all` | `POST /logout-all` | 7d |
| `token_refreshed` | `POST /refresh` | 7d |
| `impersonation_start` | `POST /impersonate/:orgId` | 180d |
| `impersonation_exit` | `POST /impersonate/exit` | 180d |

**Impersonation**: desde `d8248f8`, `impersonation_start` emite con
`impersonating: { orgId, orgName }` y `orgId` top-level apuntando a la org
destino — aunque el token nuevo todavía no aplica en esa misma request.
Resultado: toda la sesión impersonada (`start` → acciones → `exit`) queda
filtrable en el dashboard con un solo query `impersonating.orgId = X`.

## Cache

- `auth:pkce:<state>` — state + codeVerifier del flujo OIDC (TTL 10 min).
- `auth:permissions:<userId>` — permisos RBAC resueltos (TTL 5 min, invalidar al cambiar roles).
