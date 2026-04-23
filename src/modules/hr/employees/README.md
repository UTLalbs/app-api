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
