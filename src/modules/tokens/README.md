# tokens

Almacén genérico de tokens de un solo uso: refresh tokens JWT, password reset,
email verify, invite. NO es un router — es un módulo interno consumido por `auth`
y futuros flujos de email.

## Tipos

```ts
type TokenType = 'refresh' | 'reset' | 'verify' | 'invite';
```

TTL por tipo (en `token.types.ts` → `TokenTTL`):
- `refresh` — 30 días
- `verify`  — 24 horas
- `invite`  — 72 horas
- `reset`   — 1 hora

## Colección

**Colección**: `tokens`

Índices:
- `token` único global.
- `(userId, type)` para búsquedas por usuario.
- TTL automático por `expiresAt` (Mongo elimina documentos expirados).

## Archivos

- `token.model.ts` — collection + índices.
- `token.repository.ts` — queries Mongo (insert, consume atómico, invalidate).
- `token.service.ts` — generación del string, orquestación, invalidación de
  tokens previos antes de emitir uno nuevo.
- `token.types.ts` — `Token`, `TokenDocument`, `CreateTokenDto`, `TokenType`, `TokenTTL`.

## API principal

```ts
createToken({ userId, orgId?, type })     // emite y guarda
consumeToken(token, type)                  // atomic find+markUsed
findValidToken(token, type)                // solo lectura
invalidateUserTokens(userId, type?)        // marca usados en bloque
```

## Reglas de negocio

- Al crear un token, los tokens previos del mismo `(userId, type)` se marcan `usedAt`.
  Esto garantiza un solo token válido por tipo por usuario.
- `consumeToken` es atómico (`findOneAndUpdate` con filtro `usedAt: null`) —
  seguro contra race conditions.
