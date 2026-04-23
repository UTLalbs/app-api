# audit

Bitácora de actividad de usuarios (mutaciones + lecturas sensibles) con soporte para
compliance, investigación de incidentes y dashboards de productividad.

## Arquitectura

```
Controller ─ buildAuditContext(req) ──▶  Service (mutación / lectura sensible)
                                            │
                                            ▼
                                   emitAuditEvent({ category, action, target, diff, context })
                                            │
                                            ▼
                                   audit.service.createAuditEvent
                                            │
                                            ▼
                                   BullMQ queue (Redis) — no bloquea el request
                                            │
                                            ▼
                                   audit.worker → insertOne en `audit_logs`
                                            │
                                            ▼
                                   MongoDB (TTL index sobre expiresAt)
                                            │
                         ┌──────────────────┴──────────────────┐
                         ▼                                     ▼
             GET /api/v1/audit/*                    audit-archive.job (diario)
             (dashboard consulta)                   → S3 Glacier IR → delete en Mongo
```

## Archivos

| Archivo | Rol |
|---|---|
| `audit.types.ts` | `AuditCategory`, `AuditAction`, `AuditContext`, `AuditDiff`, `SENSITIVE_ACTIONS`, `RETENTION_DAYS`, `getRetentionDays()`. |
| `audit.model.ts` | `getAuditCollection()` + índices + TTL sobre `expiresAt`. |
| `audit.service.ts` | `createAuditEvent` (push a cola) + `emitAuditEvent` (helper para services). |
| `audit.repository.ts` | Queries: `findAuditEvents`, `findAuditEventById`, `aggregateTopActors`, `aggregateTimeline`. |
| `audit.validator.ts` | Esquemas Zod para endpoints de consulta. |
| `audit.controller.ts` | Handlers HTTP paginados + stats. |
| `audit.routes.ts` | Monta `/api/v1/audit/*` con `authenticate + validate + authorize('audit','read')`. |

## Colección `audit_logs`

Estructura del documento persistido en Mongo (IDs como `ObjectId`):

```ts
{
  _id,                                  // ObjectId
  category,                             // 'auth' | 'users' | ... | 'reads' | 'system'
  action,                               // 'user_updated' | 'employee_pii_read' | ...
  actor:  { id: ObjectId, email, displayName },
  target: { type, id: ObjectId, displayName? },
  diff?:  { [field]: { old, new, isMasked? } },
  metadata?: Record<string, unknown>,
  ip, userAgent, requestId,
  orgId?: ObjectId,
  impersonating?: { orgId: ObjectId, orgName },
  createdAt, expiresAt,                 // Date
}
```

El `AuditEvent` que devuelve la API (vía `findAuditEvents` / endpoints `/audit/*`)
convierte todos los `ObjectId` a strings hex — el frontend recibe JSON plano sin
`$oid` wrappers. Si `metadata` contiene IDs de negocio pónelos como **strings**
(es `Record<string, unknown>` free-form) y preferentemente como `target` cuando
representen el recurso afectado.

### Índices

- `actor.id + createdAt desc` — actividad por usuario.
- `target.id + createdAt desc` — historial de un recurso.
- `orgId + createdAt desc` — filtro por tenant.
- `category + action + createdAt desc` — top actions.
- `expiresAt` TTL — borrado automático cuando expira.

## Retención dual

| Horizonte | Días | Qué cae aquí |
|---|---|---|
| Corto | 7 | todas las mutaciones rutinarias (user_updated, task_created, org_updated, etc.) |
| Largo | 180 | acciones sensibles: login_failed, impersonation, role_permissions_changed, user_status_changed, employee_pii_updated, employee_pii_read, employee_document_url_issued, etc. |

Lista completa en `audit.types.ts → SENSITIVE_ACTIONS`.

## Cola y worker (BullMQ)

- `auditQueue` (nombre `audit`) — `src/infrastructure/jobs/audit.queue.ts`.
- `audit.worker` arranca junto con el HTTP en `server.ts`.
- Reintentos: 3 con backoff exponencial, DLQ para inspección manual.
- Worker calcula `expiresAt` según la acción e inserta en Mongo.

Si Redis cae, el evento se pierde silenciosamente y se loguea con Pino (no tumba el request).
Para producción crítica: mover el worker a un proceso separado (`worker:audit` script).

## Cold storage

- Job diario (`cron '0 3 * * *'` UTC) en `src/infrastructure/jobs/audit-archive.job.ts`.
- Query: eventos con `expiresAt < now + 7 días`.
- Chunks de hasta 5 000 documentos → NDJSON → gzip → S3 Glacier IR.
- Path: `s3://$AUDIT_ARCHIVE_BUCKET/audit/YYYY/MM/DD/chunk-<uuid>.ndjson.gz`.
- Solo elimina de Mongo tras confirmar upload. Si falla, reintenta al día siguiente.
- No-op si `AUDIT_ARCHIVE_BUCKET` no está definido (dev/staging).

## Endpoints (dashboard backend)

Todos requieren `authenticate` + `authorize('audit', 'read')`.
Tienen el recurso RBAC `audit`: por defecto `super_admin` (FULL) y `org_admin` (READ_ONLY).

### `GET /api/v1/audit/events`

Listado paginado con filtros.

Query params (todos opcionales):
- `category`, `action`, `actorId`, `targetId`, `targetType`, `orgId`
- `from`, `to` (ISO date)
- `page` (≥1, default 1), `limit` (1-200, default 50)

Response:
```json
{
  "success": true,
  "data": [AuditEvent, ...],
  "meta": { "total": 1234 }
}
```

### `GET /api/v1/audit/events/:id`

Un evento completo con `diff` renderizado.

### `GET /api/v1/audit/actors/:actorId/activity`

Actividad de un usuario concreto, paginada.

### `GET /api/v1/audit/stats/top-actors`

Ranking de usuarios por volumen de eventos. Ideal para el dashboard de
"¿quién está trabajando más?".

```
?from=2026-04-01&to=2026-04-30&category=employees&limit=10
```

Response:
```json
{
  "success": true,
  "data": [
    { "actorId": "...", "actorEmail": "juan@...", "actorDisplayName": "Juan", "total": 142 },
    ...
  ]
}
```

### `GET /api/v1/audit/stats/timeline`

Bucketing temporal para gráficas (hourly/daily).

```
?from=2026-04-15&to=2026-04-22&category=tasks&granularity=day
```

Response:
```json
{
  "success": true,
  "data": [
    { "bucket": "2026-04-15", "count": 48 },
    { "bucket": "2026-04-16", "count": 61 },
    ...
  ]
}
```

### `GET /api/v1/audit/stats/target-activity`

Historial completo de un recurso (ej.: todo lo que le pasó a un empleado).

```
?targetId=68ab...&targetType=employee&from=...&to=...
```

## Contrato para la UI

- Los `diff.<field>.isMasked = true` significan que el valor original es PII
  (rfc/curp/nss/bankAccount/passwordHash, etc.). Renderizar con un candado o
  placeholder — **nunca intentar recuperar el valor real** (no se guarda).
- Las fechas vienen como ISO strings en JSON.
- `actor.id` puede aparecer con el mismo valor aunque `impersonating` esté presente —
  el "dashboard" debe mostrar claramente que fue una sesión impersonada
  (`impersonating: { orgId, orgName }` presente).

### Ejemplos de queries típicas de la UI

| Vista | Endpoint |
|---|---|
| "Actividad de Juan hoy" | `/events?actorId=...&from=<today>` |
| "Top 10 productivos del mes" | `/stats/top-actors?from=<month>&limit=10` |
| "Logins fallidos última semana" | `/events?category=auth&action=login_failed&from=<week>` |
| "Historial del empleado X" | `/stats/target-activity?targetId=X&targetType=employee` |
| "Accesos a PII último trimestre" | `/events?category=reads&from=<quarter>` |
| "Timeline de mutaciones hoy" | `/stats/timeline?from=<today>&granularity=hour` |

## Integración en services (cómo auditar algo nuevo)

```ts
// 1) Controller: construye el contexto
import { buildAuditContext } from '../../shared/utils/auditContext';

export const updateX = asyncHandler(async (req, res) => {
  const result = await editX(id, dto, buildAuditContext(req));
  res.json({ success: true, data: result });
});

// 2) Service: lee "antes", aplica mutación, emite evento con diff
import { emitAuditEvent } from '../audit/audit.service';
import { computeDiff } from '../../shared/utils/diff';

export async function editX(id, dto, context) {
  const before = await findXById(id);
  const after = await updateX(id, dto);

  const diff = computeDiff(before, after, {
    allowedFields: ['name', 'status', 'phones'],
  });

  await emitAuditEvent({
    category: 'tasks',
    action: 'task_updated',
    target: { type: 'task', id, displayName: after.title },
    diff: diff ?? undefined,
    context,
  });

  return after;
}
```

### Servicios con eventos ya integrados

- `users`: create/update/delete/status_change/role_assigned.
- `organizations`: create/update/delete.
- `roles`: create/update/delete/permissions_changed.
- `tasks`: create/update/reassigned/resolved/deleted.
- `employees`:
  - lectura sensible (`employee_pii_read`, `employee_document_url_issued`),
  - perfil (`employee_updated` / `employee_pii_updated` con diff real + enmascaramiento),
  - estatus (`employee_status_changed`),
  - contactos de emergencia add/edit/delete (`employee_updated` + metadata.operation),
  - cuentas bancarias add/edit/delete (`employee_pii_updated` + metadata.operation),
  - documentos upload/update/delete (`employee_document_uploaded` / `employee_document_updated` / `employee_document_deleted`).
- `hr/positions` y `hr/departments` (catálogos per-org): `position_created/_updated/_deleted`, `department_created/_updated/_deleted` — todos categoría `employees`, retención 7d.
- `auth`: login_success, logout, logout_all, token_refreshed, impersonation_start/exit.

### Servicios con integración pendiente

Pueden seguir el mismo patrón cuando se necesite:
- `hr/document-catalog`, `hr/document-profiles`.
- `notifications` — no se audita por diseño (ruido).

## Variables de entorno

- `AUDIT_ARCHIVE_BUCKET` (opcional) — bucket S3 de cold storage. Sin esto, el job de
  archivo se registra pero queda no-op.

## Lecturas auditadas

| Endpoint | Action | Retención | Condición |
|---|---|---|---|
| `GET /api/v1/employees/:id` | `employee_pii_read` | 180d | Siempre |
| `GET /api/v1/employees/:id/documents/:docId/url` | `employee_document_url_issued` | 180d | Siempre |
| `GET /api/v1/users/:id` | `user_read` | 7d | Solo si `actor.id !== target.id` (self-reads no se auditan) |

## Metadata convencional en eventos de empleado

Cuando la acción es genérica (`employee_updated` o `employee_pii_updated`) pero
el cambio afecta una sub-colección del perfil, el service añade
`metadata.operation` para que el dashboard pueda distinguirlos sin parsear el
`diff`. Valores usados hoy:

| operation | Action |
|---|---|
| `emergency_contact_added` / `_updated` / `_deleted` | `employee_updated` (7d) |
| `bank_account_added` / `_updated` / `_deleted` | `employee_pii_updated` (180d) |
