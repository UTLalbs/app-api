# hr/document-profiles

Bundles de documentos requeridos por puesto/rol. Ejemplo: "Chofer" requiere
{Licencia, Examen médico, INE}. Un empleado se asigna a un perfil y hereda sus
requerimientos.

## Endpoints

Prefijo: `/api/v1/hr/document-profiles`

CRUD de perfiles (ver `document-profile.routes.ts`).

## Colección

**Colección**: `document_profiles`

Campos clave: `orgId`, `name`, `description`, `items: [{catalogId, alertDays}]`.

## Reglas de negocio

- `name` único por `orgId`.
- Cambiar los items de un perfil **no** re-propaga al checklist de empleados ya
  asignados automáticamente — requiere acción explícita desde `hr/employees`.
- `alertDays` — días antes de vencimiento para alertar (usado por job `employee.alerts.job`).

## Dependencias

- `hr/document-catalog` — fuente de `catalogId`.
- `hr/employees` — consume perfiles al asignar puesto.
