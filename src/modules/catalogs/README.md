# catalogs

Sirve catálogos del SAT (`c_SubTipoRem`, `c_RegimenFiscal`, etc.) al frontend.

Internamente lee de Redis y, si el cache miss, llama a `SatProvider.getCatalog`
del módulo `sat`. Un cron diario refresca todos los catálogos para mantener el
cache caliente.

## Endpoints

Prefijo: `/api/v1/catalogs` · Requiere `authenticate` (sin permiso especial).

| Método | Path                  | Descripción                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/sat/:catalogKey`    | Devuelve un catálogo SAT cacheado.   |

`catalogKey` debe ser uno del whitelist en `constants/sat-catalogs.constants.ts`.

## Respuesta

```json
{
  "success": true,
  "data": {
    "catalogKey": "c_SubTipoRem",
    "data": [{ "code": "CTR007", "description": "Caja Seca" }, ...],
    "lastSyncedAt": "2026-05-06T03:00:00.000Z",
    "stale": false
  }
}
```

`stale: true` significa que la última sincronización contra el proveedor falló
y se está sirviendo una copia previa. El cliente puede mostrar un banner sutil.

## Cache

- Key: `sat:catalog:<catalogKey>` en Redis
- TTL: 7 días (salvaguarda contra outages)
- Refresco programado: cada día a las 03:00 UTC vía `catalogs-sync.job.ts`

## Errores

- `400 SAT_CATALOG_UNSUPPORTED` — catalogKey no soportada por el provider activo.
- `503 SAT_CATALOG_UNAVAILABLE` — sin cache y proveedor inalcanzable.

## Variables de entorno

Hereda las del módulo `sat` (FacturoPorTi). No tiene config propia.
