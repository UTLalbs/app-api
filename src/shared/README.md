# shared

Código compartido entre módulos. No pertenece a ningún dominio de negocio.

## Estructura

```
shared/
├── constants/    # valores tipados: USER_STATUS, USER_TYPE, SYSTEM_ROLE, TASK_STATUS, ...
├── errors/       # AppError + subclases (Validation, Auth, NotFound, Conflict, Forbidden, Internal)
├── types/        # express.d.ts — augment de Request con req.user, req.requestId
└── utils/        # asyncHandler, slug, objectId
```

## Cuándo agregar algo aquí

Si **dos o más módulos** necesitan la misma pieza y no tiene dependencias con
dominios concretos, va aquí. Ejemplos válidos:

- Un helper que normaliza strings (`generateSlug`).
- Un wrapper de validación (`toObjectIdOrNull`).
- Una clase de error genérica (`ConflictError`).

**NO pongas aquí** código que sí pertenece a un dominio, incluso si lo usa otro
módulo. Prefiere importar del módulo original.

## constants/

Patrón:
```ts
export const USER_STATUS = {
  PENDING:   'pending',
  ACTIVE:    'active',
  ...
} as const satisfies Record<string, UserStatus>;
```

El `satisfies Record<string, UserStatus>` obliga a que los valores sean miembros del
union type fuente (definido en `*.types.ts` del módulo dueño). Si el type cambia,
aquí da error en compile-time.

Uso:
```ts
import { USER_STATUS } from '@/shared/constants';   // futuro alias
import { USER_STATUS } from '../../shared/constants'; // hoy

if (user.status === USER_STATUS.PENDING) { ... }
```

## errors/

Las subclases de `AppError` tienen `statusCode` + `code` predefinidos y el
`errorHandler` las mapea automáticamente a la respuesta JSON.

```ts
throw new NotFoundError('User');         // 404 NOT_FOUND
throw new ConflictError('Email exists'); // 409 CONFLICT
throw new ValidationError([{field:'rfc', message:'invalid'}]); // 400 VALIDATION_ERROR
throw new ForbiddenError('tasks');       // 403 FORBIDDEN
throw new AuthError();                   // 401 AUTH_ERROR
```

**Nunca** `throw new Error(...)` — el errorHandler lo trata como 500 desconocido.

## utils/

- `asyncHandler(fn)` — wrap de controllers; captura promesas rechazadas y las
  pasa a `next(err)`. **Obligatorio** en todos los controllers.
- `generateSlug(name)` — normaliza nombre a slug URL-safe.
- `toObjectIdOrNull(id)` — valida y convierte string → ObjectId, o null si inválido.
  Útil en repositories para devolver "no encontrado" sin lanzar `BSONError`.

## types/

- `express.d.ts` augmenta `Request` con:
  - `req.user: AuthenticatedUser` (poblado por `authenticate` middleware).
  - `req.requestId: string` (poblado por `requestId` middleware).
