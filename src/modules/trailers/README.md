# trailers

Catálogo de remolques (semirremolques, plataformas, tanques, etc.) de la flota.

## Endpoints

Prefijo: `/api/v1/trailers` · Permiso: `trailers:*`.

| Método | Path                          | Acción                                      |
| ------ | ----------------------------- | ------------------------------------------- |
| GET    | `/`                           | Listar (filtros: status, ctrSubtype, …)     |
| GET    | `/:id`                        | Detalle                                     |
| POST   | `/`                           | Alta completa (todos los bloques)           |
| POST   | `/quick-register`             | Alta rápida (intercambio temporal)          |
| PATCH  | `/:id`                        | Actualizar                                  |
| DELETE | `/:id`                        | Soft delete                                 |
| POST   | `/:id/transition-status`      | Cambio de status (máquina de estados)       |

## Validaciones cruzadas (V1-V19)

Definidas en `trailers.service.ts` y `trailers.validator.ts`:

| #   | Regla                                                                          |
| --- | ------------------------------------------------------------------------------ |
| V1  | VIN único por org entre no-eliminados (índice partial unique)                  |
| V2  | (UI) reactivar VIN previamente eliminado                                       |
| V3  | plates.mx único por org si existe                                              |
| V4  | plates.us único por org si existe                                              |
| V5  | Al menos una placa MX o US                                                     |
| V6  | economicNumber único por org si existe                                         |
| V7  | ctrSubtype existe en catálogo cacheado c_SubTipoRem                            |
| V8  | modelYear ∈ [1980, currentYear+1]                                              |
| V9  | pbvdKg > taraKg > 0                                                            |
| V10 | type='owned' → internalTaxIdId requerido y activo                              |
| V11 | type≠'owned' → businessPartnerId requerido y activo                            |
| V12 | type='exchange' → partner debe tener role 'trailer_exchange_partner'           |
| V13 | type∈leased*/commodatum → partner debe tener 'lessor' (warning, no bloquea)    |
| V14 | type='leased_fixed_term' → contract.endDate requerido                          |
| V15 | endDate > startDate                                                            |
| V17 | (UI) NHTSA BodyClass discrepa → warning, no bloquea                            |
| V18 | hasEnclosedBody=false → wallMaterial/floorMaterial/etc deben ser null          |
| V19 | isSemiTrailer=false → kingpinDiameterInches/hasLandingGear deben ser null      |

## Máquina de estados

```
available (default al crear) → in_maintenance | out_of_service | decommissioned | returned_to_partner*
in_maintenance → available | out_of_service
out_of_service → available | decommissioned
in_transit → available  (no manual)
decommissioned → (terminal)
returned_to_partner → (terminal, solo trailers en exchange)
```

`returned_to_partner` solo aplica cuando `ownership.type === 'exchange'`.

## Cascade-block

- `taxId.disableTaxId(orgId, taxIdId)` rechaza si algún trailer no eliminado lo
  referencia en `ownership.internalTaxIdId`.
- `business-partners.softDelete(id)` rechaza si algún trailer no eliminado lo
  referencia en `ownership.businessPartnerId`.

## Auditoría

Categoría `trailers`. Eventos:

- `trailer_created`
- `trailer_quick_registered`
- `trailer_updated`
- `trailer_status_changed`
- `trailer_returned_to_partner`
- `trailer_decommissioned`
- `trailer_deleted`

## Constants

- `constants/ctrCharacteristics.constants.ts` — flags por subtipo (`isSemiTrailer`, `hasEnclosedBody`).
- `constants/trailerManufacturers.constants.ts` — catálogo base + helper `findManufacturerByName`.
- `helpers/plate-normalizer.ts` — normaliza placas (uppercase, strip non-alphanum).

> Las constantes `CTR_CHARACTERISTICS` y `TRAILER_MANUFACTURERS` están duplicadas
> en el frontend (`app-web/src/lib/utils/`). **Cambiar siempre en pareja**.
