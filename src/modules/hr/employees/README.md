# hr/employees

Gestión de empleados. Los empleados **no tienen su propia colección** — viven como
subdocumento `employeeProfile` dentro de `users` collection.

## Endpoints

Prefijo: `/api/v1/employees` · Requiere `authenticate` + `rateLimiter`.

CRUD + operaciones específicas de RH (checklist de documentos, employmentStatus,
onboarding). Ver `employee.routes.ts`.

## Colección

**Colección**: `users` (subdocumento `employeeProfile`).

El módulo usa `getUserCollection()` directamente — no tiene `employee.model.ts` por
esta razón. El repo vive en `employee.repository.ts` y filtra por `employeeProfile: {$exists: true}`.

## Archivos

- `employee.routes.ts`, `employee.controller.ts`, `employee.service.ts`,
  `employee.repository.ts`, `employee.validator.ts`, `employee.types.ts`.
- `employee.checklist.ts` — lógica del checklist de documentos (pendings,
  completions).
- `employee.encryption.ts` — encriptación de campos sensibles (CURP, RFC, NSS).

## Reglas de negocio

- **`position` y `department`**: ya no son enums fijos — son `string | null`
  que referencian `key` de los catálogos per-org `positions` y `departments`
  (ver `hr/positions/README.md` y `hr/departments/README.md`). El campo
  `employeeType` fue eliminado; la distinción operador/admin quedó absorbida
  por `position`.
- Al crear un empleado se genera su `employeeProfile` inicial con status `'pending'`
  y checklist vacío.
- Cambiar `employmentStatus` (`active`/`leave`/`vacation`/`disability`/`suspended`/`terminated`)
  sincroniza el `userStatus` del user padre (`active` → `active`, el resto → `inactive`).
- **Soft delete**: `deletedAt` en el user parent — queries filtran por `deletedAt: null`
  por default, excepto endpoints explícitos (`GET /:id` ignora `deletedAt` para
  permitir ver empleados terminados).

## Dependencias

- `users` — todos los empleados son usuarios.
- `hr/document-catalog` — fuente del checklist inicial.
- `hr/document-profiles` — bundles por puesto.
- `infrastructure/storage/s3` — archivos subidos del checklist.
- Redis — cache de empleados por orgId, invalidado en cada mutación.

## Datos sensibles

Campos encriptados antes de guardar (ver `employee.encryption.ts`):
- `rfc`, `curp`, `nss`, `bankAccount`, `taxId`.

Usar `decryptEmployeeFields` al leer para los usuarios autorizados.

## Normalización de RFC

Los campos `rfcValidatedAt` y `rfcValidatedStatus` son **metadata de sistema** —
solo cambian cuando el RFC realmente cambia. El frontend puede reenviarlos en
cada submit del formulario (por haber disparado la validación al abrir el form),
pero `editEmployeeProfile` los descarta del DTO cuando:

- `rfc` no viene en el payload, o
- `rfc` viene igual al valor guardado.

Si el `rfc` entrante coincide con el actual, también se elimina del DTO para
que no aparezca en `changedFields` ni dispare un diff vacío. Resultado:
guardar el form sin tocar el RFC no ensucia el audit log ni re-valida contra
FacturoPorTi.

## Auditoría

| Operación | Action | Categoría | Retención | Notas |
|---|---|---|---|---|
| `GET /:id` | `employee_pii_read` | `reads` | 180d | Siempre — lectura sensible |
| `GET /:id/documents/:docId/url` | `employee_document_url_issued` | `reads` | 180d | URL presignada S3 |
| `PATCH /:id/profile` (campos no PII) | `employee_updated` | `employees` | 7d | Diff real (`computeDiff`) |
| `PATCH /:id/profile` (campos PII: rfc / curp / nss / bankAccounts) | `employee_pii_updated` | `employees` | 180d | Diff con valores enmascarados |
| `PATCH /:id/employment-status` | `employee_status_changed` | `employees` | 180d | Diff: `employmentStatus` old/new |
| Contactos de emergencia add / edit / delete | `employee_updated` | `employees` | 7d | `metadata.operation = emergency_contact_added | _updated | _deleted` |
| Cuentas bancarias add / edit / delete | `employee_pii_updated` | `employees` | 180d | `metadata.operation = bank_account_added | _updated | _deleted` |
| Documentos upload | `employee_document_uploaded` | `documents` | 180d | |
| Documentos update (status, notas, fechas, renewal) | `employee_document_updated` | `documents` | 180d | Diff real |
| Documentos delete | `employee_document_deleted` | `documents` | 180d | |

- La distinción PII vs no-PII en `PATCH /:id/profile` se deriva del **diff real**
  post-`computeDiff`, no de los campos del DTO — si el frontend envía `rfc` pero
  no cambió, el evento final es `employee_updated` (no `employee_pii_updated`).
- Si el diff resulta vacío (nada cambió), **no se emite evento**.

Detalle de retención, contrato del evento y convenciones de `metadata.operation`
en `src/modules/audit/README.md`.
