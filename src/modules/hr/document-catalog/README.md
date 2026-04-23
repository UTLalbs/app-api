# hr/document-catalog

Catálogo de tipos de documentos que puede tener un empleado (INE, CURP, Licencia,
etc.). Se siembra por organización al crearse.

## Endpoints

Prefijo: `/api/v1/hr/document-catalog`

CRUD del catálogo (ver `document-catalog.routes.ts`).

## Colección

**Colección**: `document_catalog`

Campos clave: `orgId`, `code`, `name`, `description`, `isRequired`, `validityDays`,
`fileUrl` (plantilla opcional).

## Reglas de negocio

- Eliminar un item del catálogo **propaga** cambios a:
  - empleados con ese item en su checklist.
  - perfiles de documentos (bundles) que lo referencien.
- Esta operación multi-documento está en `removeDocumentCatalogItem` — **pendiente**
  de envolver en `ClientSession` (transacción Mongo) para atomicidad.

## Seed

`document-catalog.seed.ts` — ejecutar con `npm run seed:catalog`.
Se ejecuta también automáticamente al crear una org nueva (`initDocumentCatalogForOrg`).
