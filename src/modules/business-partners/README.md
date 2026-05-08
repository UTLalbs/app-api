# business-partners

Colección raíz para entidades externas con las que el tenant tiene relación
comercial: arrendadores, partners de intercambio de remolques, y eventualmente
clientes y proveedores.

En el futuro `clients` y `suppliers` proyectarán sobre estos registros — por
eso `businessPartners` es la fuente única de identidad fiscal y contacto.

## Endpoints

Prefijo: `/api/v1/business-partners`

| Método | Path                    | Acción                              |
| ------ | ----------------------- | ----------------------------------- |
| GET    | `/`                     | Listar (filtros: role, isActive…)   |
| GET    | `/:id`                  | Detalle                             |
| POST   | `/`                     | Crear                               |
| PATCH  | `/:id`                  | Actualizar                          |
| DELETE | `/:id`                  | Soft delete                         |
| POST   | `/:id/validate-rfc`     | Validar RFC contra el SAT (vía sat) |

## Permisos

`businessPartners` NO es un Resource RBAC propio. Los endpoints reusan el
permiso `'trailers'`:

- list/get/validate → `trailers:read`
- create → `trailers:create`
- update → `trailers:update`
- delete → `trailers:delete`

Razón: managing partners es parte del workflow de trailers (exchange/leasing).
Nadie va a tener un permiso aislado "business_partners".

## Roles del partner (NO es lo mismo que rol RBAC)

`BusinessPartnerRole` describe el TIPO de relación comercial:

- `trailer_exchange_partner` — partner que presta remolques en intercambio
- `lessor` — arrendador de equipo

Un mismo partner puede tener varios roles. Cuando se crea un trailer en
intercambio, el partner debe tener role `trailer_exchange_partner`. Cuando es
arrendado, debe tener `lessor` (esta validación se cierra en Sprint 1.5).

## Régimen tributario

Discriminated union: `mexican` requiere `rfc` (sin foreignTaxId), `foreign`
requiere `foreignTaxId` + `foreignTaxCountry` (ISO 3166-1).

Solo se puede validar RFC contra el SAT si `taxRegime === 'mexican'`.

## Índices

- `{orgId, deletedAt}` — scope multi-tenant + soft delete
- `{orgId, isActive}` — listados típicos
- `{orgId, roles}` — filtro por rol
- `{orgId, rfc}` partial unique — RFC único por org entre no-eliminados
- `{orgId, foreignTaxId}` partial unique — Tax ID único por org

## Auditoría

Categoría `business_partners` con eventos:

- `business_partner_created`
- `business_partner_updated`
- `business_partner_deactivated`
- `business_partner_role_added`
- `business_partner_role_removed`
