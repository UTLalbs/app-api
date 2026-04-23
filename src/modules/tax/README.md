# tax

Integración con la API de FacturoPorTi. No toca MongoDB — es un wrapper HTTP.

## Endpoints

Prefijo: `/api/v1/tax` · Requiere `authenticate` + `rateLimiter`.

| Método | Path | Descripción |
|---|---|---|
| GET  | `/postal-code/:cp` | Datos del CP (estado, municipio, colonias). |
| POST | `/validate-rfc`    | Valida un RFC contra el SAT vía FacturoPorTi. |

## Sin repository (por diseño)

No tiene `*.repository.ts` ni `*.model.ts` porque no persiste nada. Toda la lógica
vive en `tax.service.ts` y llama a la API externa con `axios`.

## Variables de entorno

- `FACTUROPORTI_API_KEY` — clave de acceso.
- `FACTUROPORTI_BASE_URL` — endpoint base (prod/sandbox).

## Notas

- TODO: considerar cachear respuestas de `getPostalCodeData` en Redis (TTL largo) —
  los CPs rara vez cambian y se ahorra presión sobre el proveedor.
