# Arquitectura — app-api

API HTTP del sistema . Diseñada para ser leída en ~20 minutos por un dev nuevo
antes de tocar código.

---

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Runtime | Node.js + TypeScript | Ecosistema del equipo |
| HTTP | Express 5 | Middleware explícito, sin magia |
| Base de datos | MongoDB (driver nativo, no Mongoose) | Control total sobre queries, proyecciones y tipos |
| Cache / sesiones | Redis (ioredis) | Permisos, PKCE, rate-limit, refresh tokens |
| Colas async | BullMQ sobre Redis | Eventos de auditoría fuera del request cycle |
| Validación | Zod | Inferencia de tipos + validación en un solo lugar |
| Logging | Pino | Estructurado JSON, rápido |
| Auth | OIDC (Google, Microsoft) + JWT en cookies | Sin passwords locales |
| Storage | AWS S3 | Documentos de empleados + cold storage de audit (Glacier IR) |
| Tests | Jest + mongodb-memory-server | Integración con Mongo real en memoria |
| Docs API | OpenAPI + swagger-ui-express | `/api/docs` en dev |
| Cron | node-cron | Jobs periódicos (alerts, archivado de audit) |

---

## 2. Estructura de carpetas

```
src/
├── app.ts                  # createApp() — monta middlewares y routers
├── server.ts               # bootstrap: conecta DB/Redis, arranca HTTP + audit worker + cron jobs
├── config/                 # env, logger, database, redis
├── middleware/             # authenticate, authorize, validate, errorHandler, rateLimiter, requestId
├── infrastructure/
│   ├── cache/              # Redis helpers (getOrSet, cacheDel)
│   ├── jobs/               # BullMQ queues/workers + cron jobs (audit, employee alerts)
│   └── storage/            # S3 client + helpers
├── shared/
│   ├── errors/             # AppError + subclases (Validation, Auth, NotFound, Conflict, Forbidden, Internal)
│   ├── utils/              # asyncHandler, diff, slug, objectId, auditContext
│   ├── constants/          # USER_TYPE, USER_STATUS, SYSTEM_ROLE, TASK_STATUS, audit sensitive fields
│   └── types/              # express.d.ts (augment de Request)
├── docs/                   # OpenAPI spec (paths, schemas)
└── modules/<dominio>/      # un módulo por dominio de negocio
```

### Módulos

Cada módulo vive en `src/modules/<dominio>/` y sigue el mismo patrón de archivos:

```
<dominio>/
├── <dominio>.routes.ts     # Express Router — monta endpoints
├── <dominio>.validator.ts  # Zod schemas (body/params/query) + z.infer
├── <dominio>.controller.ts # handlers HTTP — parse request, invoca service, arma respuesta
├── <dominio>.service.ts    # lógica de negocio — orquesta repos y reglas
├── <dominio>.repository.ts # acceso a Mongo — queries aisladas
├── <dominio>.model.ts      # getCollection() + índices
└── <dominio>.types.ts      # Document (Mongo), Domain (lo que devuelve service), DTOs
```

---

## 3. Flujo de una petición

`POST /api/v1/users` como ejemplo:

```
Cliente
  │
  ▼
[express.json + cookieParser + helmet + cors]     ← app.ts
  │
  ▼
[requestId + httpLogger + rateLimiter]            ← observabilidad
  │
  ▼
[authenticate]                                    ← verifica access_token JWT, pone req.user
  │
  ▼
[validate(createUserSchema)]                      ← Zod → req.body, req.params, req.query tipados
  │
  ▼
[authorize('users', 'create')]                    ← resuelve permisos del user desde Redis/Mongo
  │
  ▼
user.controller.createUser                        ← extrae data de req, llama al service
  │
  ▼
user.service.createUser                           ← reglas de negocio, hash, valida duplicados
  │
  ▼
user.repository.insertUser                        ← insertOne en users collection
  │
  ▼
Mongo
  │
  ▼
(vuelve hacia arriba) → toUser() convierte Document → Domain → res.json({success,data})
```

Si algo lanza un error en cualquier capa:
1. `asyncHandler` en el controller captura promesas rechazadas.
2. `next(err)` lleva el error a `errorHandler` (último middleware de `app.ts`).
3. `errorHandler` mapea `AppError` → status + JSON estándar, o loguea y devuelve 500.

**Auditoría transversal**: cualquier mutación o lectura sensible emite un evento
hacia la cola BullMQ (ver sección 9). La emisión es **fire-and-forget** — nunca
bloquea ni falla la request. El controller construye el `AuditContext` con
`buildAuditContext(req)` y lo pasa al service; el service decide qué acción y
target emitir.

---

## 4. Responsabilidades por capa

**Lo que cada capa SÍ puede hacer, y lo que NO.**

### Route (`*.routes.ts`)
- **SÍ**: registrar endpoints, montar middlewares en orden.
- **NO**: lógica, queries, transformación de datos.
- **Orden estándar**: `authenticate → validate → authorize → controller`.

### Validator (`*.validator.ts`)
- **SÍ**: esquemas Zod para `body`, `params`, `query` (en un solo schema raíz con tres llaves).
- **SÍ**: exportar tipos con `z.infer<typeof schema>`.
- **NO**: lógica de negocio, queries.

### Controller (`*.controller.ts`)
- **SÍ**: leer `req.body/params/query/user`, llamar al service, armar `res.json({success, data, meta?})`.
- **SÍ**: wrapping con `asyncHandler` (obligatorio — no try/catch manual).
- **NO**: queries a Mongo, reglas de negocio, validación extra.

### Service (`*.service.ts`)
- **SÍ**: reglas de negocio, orquestación (llamar varios repos), invalidación de cache, notificaciones, logging de operaciones.
- **SÍ**: lanzar `AppError` subclases (`NotFoundError`, `ConflictError`, `ValidationError`, `ForbiddenError`, `AuthError`).
- **SÍ**: emitir eventos de auditoría con `emitAuditEvent({ category, action, target, diff, context })` en mutaciones y lecturas sensibles. El `context` viene como último parámetro desde el controller.
- **NO**: tocar `req`/`res`, queries a Mongo inline (debe pasar por repository).

### Repository (`*.repository.ts`)
- **SÍ**: queries Mongo, proyecciones, conversión `Document → Domain`.
- **SÍ**: validar `ObjectId.isValid()` antes de `new ObjectId()`.
- **NO**: reglas de negocio, lanzar errores HTTP, acceder a otros módulos (excepto helpers compartidos).

### Model (`*.model.ts`)
- **SÍ**: `getCollection()` typed, declarar índices, re-exportar el nombre de la colección.
- **NO**: queries, lógica.

### Types (`*.types.ts`)
- `<X>Document` — como vive en Mongo (campos `ObjectId`, fechas como `Date`).
- `<X>` (Domain) — como lo devuelve el service (IDs como `string`, listo para JSON).
- `Create<X>Dto`, `Update<X>Dto` — input de mutaciones.
- `interface` para documentos y DTOs públicos; `type` para uniones/aliases derivados.

---

## 5. Tabla de módulos

| Módulo | Prefijo | Colección Mongo | Dominio |
|---|---|---|---|
| `auth` | `/api/v1/auth` | (usa `users`) | OIDC login Google/Microsoft, refresh, logout, me, impersonate |
| `users` | `/api/v1/users` | `users` | CRUD usuarios del sistema (staff, admins, super_admin) |
| `organizations` | `/api/v1/organizations` | `organizations` | Tenants del SaaS |
| `roles` | `/api/v1/roles` | `roles` | Roles del sistema + permisos (RBAC resource/action) |
| `tax` | `/api/v1/tax` | (API externa) | Integración FacturoPorTi — CP y validación RFC |
| `tasks` | `/api/v1/tasks` | `tasks` | Tickets/work items (autorización por data-layer) |
| `notifications` | `/api/v1/notifications` | `notifications` | Feed de notificaciones del usuario |
| `tokens` | (interno) | `tokens` | Refresh tokens JWT + password reset / magic link |
| `audit` | `/api/v1/audit` | `audit_logs` + S3 archive | Bitácora de actividad (writes + reads sensibles) + dashboard backend |
| `hr/employees` | `/api/v1/employees` | `users` (subdoc `employeeProfile`) | Empleados — RH |
| `hr/document-catalog` | `/api/v1/hr/document-catalog` | `document_catalog` | Catálogo de tipos de documentos |
| `hr/document-profiles` | `/api/v1/hr/document-profiles` | `document_profiles` | Perfiles/bundles de documentos por puesto |

Módulos sin `*.repository.ts` por diseño:
- **`auth`**: opera sobre `users` vía `user.repository` y sobre `tokens` vía `token.service`. No necesita uno propio.
- **`tax`**: llama a API externa (FacturoPorTi), no toca Mongo.

---

## 6. Convenciones

### Errores
Todos los errores esperables son subclases de `AppError`:

```ts
throw new NotFoundError('User');
throw new ConflictError('Email already in use');
throw new ValidationError([{ field: 'rfc', message: 'Invalid RFC' }]);
throw new ForbiddenError('Access denied to tasks');
throw new AuthError('Invalid token');
```

**Nunca** `throw new Error('…')` — el `errorHandler` lo devuelve como 500 genérico.

### Logging
- **Services** loguean operaciones de negocio: `logger.info({ userId, orgId }, 'User created')`.
- **Controllers** NO loguean (salvo OIDC callbacks con redirect, que son efectos colaterales externos).
- Siempre objeto primero, mensaje después (`logger.info({ ctx }, 'Message')`). Esto lo impone Pino.
- Niveles: `info` (éxito), `warn` (operacional recuperable / 4xx), `error` (inesperado / 5xx).

### Cache (Redis)
Helpers en `src/infrastructure/cache/`:
- `getOrSet(key, ttl, loader)` para lecturas.
- `cacheDel(key)` para invalidar al mutar.

**Regla**: si un service cachea una lectura, sus mutaciones deben invalidar la misma key.
Keys convencionales: `<dominio>:<id>`, `auth:permissions:<userId>`, etc.

### Transacciones Mongo
Si una operación modifica varios documentos y una falla deja estado inconsistente,
usar `ClientSession` del driver nativo (`withTransaction`). No todas las operaciones
multi-documento necesitan transacción — solo las que deben ser atómicas.

### RBAC
`authorize(resource, action)` es middleware factory.
- `resource` debe estar en el tipo `Resource` de `src/modules/roles/role.types.ts`.
- `action` debe estar en el tipo `Action` (mismo archivo).
- `super_admin` bypasea la verificación (atajo en `middleware/authorize.ts`).
- Cache de permisos en Redis (TTL 5 min) — se invalida con `invalidatePermissionsCache(userId)` al cambiar roles.

Cuando la autorización es por **dueño del recurso** (no por rol), se hace en el service
comparando `req.user.id` contra campos del documento (ej. `tasks.editTask`).

### Naming
- Controllers: **verbos HTTP** (`createUser`, `getUsers`, `updateUser`, `deleteUser`).
- Services: **verbos de negocio** (`submitTask`, `resolveTask`, `invalidatePermissionsCache`).
- Repositories: `findX`, `findXById`, `findAllX`, `createX`, `updateX`, `deleteX`.

### Imports
Orden: externos → internos (`../`) → tipos (`import type`). ESLint lo enforza.

### Strings de estado / tipos
**Evitar strings mágicos**. Usar constantes tipadas desde `src/shared/constants/`
(`USER_TYPE`, `USER_STATUS`, `SYSTEM_ROLE`, `TASK_STATUS`, etc.).

### Auditoría
Toda mutación y lectura sensible debe emitir un evento:
- Controller: `buildAuditContext(req)` → pasarlo al service.
- Service: `emitAuditEvent({ category, action, target, diff, context })`.
- Para diffs usar `computeDiff(before, after, { allowedFields })` de `shared/utils/diff.ts`
  — enmascara automáticamente PII (rfc, curp, nss, passwordHash, etc.).
- Jobs/cron sin request usan `systemAuditContext(sourceHint)` — el helper omite el
  evento porque no hay actor humano.

Ver `src/modules/audit/README.md` para la lista de acciones disponibles y el contrato
del dashboard.

---

## 7. Autenticación y autorización en detalle

1. **Login**: usuario navega a `/api/v1/auth/google` → redirect a Google OIDC.
2. **Callback**: Google → `/api/v1/auth/google/callback` con código.
3. Se intercambia por perfil, se busca/crea el user en Mongo.
4. Se generan `access_token` (15 min) + `refresh_token` (30 días) JWT.
5. Se setean como **HTTP-only cookies** (`access_token`, `refresh_token`).
6. `authenticate` middleware verifica el access token en cada request y pone `req.user`.
7. `authorize(resource, action)` resuelve permisos (cache Redis) y verifica acceso.
8. Cuando el access expira, el frontend llama `POST /api/v1/auth/refresh` → rota tokens.

**Impersonation**: `super_admin` puede emitir un token con `impersonating: { orgId, orgName }`
para actuar como si perteneciera a esa org. TTL más largo (8h). Todas las acciones durante
impersonación quedan registradas en `audit_logs` con el flag `impersonating` presente para
que el dashboard pueda distinguirlas.

---

## 8. Cómo correrlo

```bash
npm install
docker compose up -d mongodb redis   # levanta dependencias
npm run dev                          # NODE_ENV=development ts-node-dev
npm run type-check                   # tsc --noEmit
npm run lint                         # eslint --max-warnings=0
npm test                             # jest
npm run seed:catalog                 # siembra catálogo de documentos
```

Endpoints útiles:
- `GET /health` — liveness
- `GET /health/ready` — readiness (pinga Mongo + Redis)
- `GET /api/docs` — Swagger UI (solo dev/staging)

Al arrancar, `server.ts` levanta en el mismo proceso:
1. Servidor HTTP (Express).
2. Audit worker (BullMQ) — consume eventos de `auditQueue` y los persiste.
3. Jobs cron: `employee.alerts.job` (alertas de vencimiento) y `audit-archive.job`
   (diario 03:00 UTC — no-op si `AUDIT_ARCHIVE_BUCKET` no está definido).

Variables de entorno críticas en `src/config/env.ts` (Zod-validadas al arranque).
Nueva opcional: `AUDIT_ARCHIVE_BUCKET` — bucket S3 para cold storage de audit logs.

---

## 9. Auditoría — pipeline completo

```
controller (buildAuditContext)
   │
   ▼
service.* (emitAuditEvent)        ← retorno al cliente no depende de esto
   │
   ▼
auditQueue.add('write', dto)      ← BullMQ push, fire-and-forget
   │
   ▼
audit.worker (proceso embebido)
   │
   ▼
audit_logs collection (Mongo)
   │
   │  expiresAt calculado por acción:
   │    sensibles (SENSITIVE_ACTIONS) → 180 días
   │    resto                         → 7 días
   │
   ├── TTL index sobre expiresAt → borrado automático
   │
   └── audit-archive.job (cron diario)
         │
         ▼
       Eventos con expiresAt < now + 7d
         → NDJSON + gzip
         → S3 Glacier IR
         → delete en Mongo tras confirmar upload
```

Consulta del dashboard: `GET /api/v1/audit/*` protegido por `authorize('audit','read')`.
Detalle de endpoints y contrato en `src/modules/audit/README.md`.

---

## 10. Patrones a evitar

- ❌ `throw new Error(...)` — usa `AppError` subclases.
- ❌ `as any` / `as unknown as X` — si lo necesitas, el tipo del DTO está mal modelado.
- ❌ Queries a Mongo dentro del controller o service directamente — siempre pasa por repository.
- ❌ `import dinámico` (`await import(...)`) — solo si hay ciclo probado; si no, estático arriba.
- ❌ Duplicar helpers pequeños (slug, mapping, ObjectId validation) — ponlos en `shared/utils/`.
- ❌ Strings mágicos (`"super_admin"`, `"pending"`) — usar constantes tipadas.
- ❌ Logs duplicados de la misma operación — si el service ya logueó, el controller no debe loguear lo mismo.
- ❌ Emitir audit desde el controller o desde el repository — solo desde el service, que es quien conoce la semántica de negocio.
- ❌ Incluir valores sensibles (RFC, CURP, NSS, password) en `metadata` del evento de audit — usar `diff` con `computeDiff` para que el enmascaramiento sea automático.
- ❌ `await` al emitAuditEvent pensando que bloquea algo útil — ya está encolado en BullMQ; no reintentes ni bloquees la respuesta del cliente si falla.
