import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { ValidationError } from '../shared/errors/AppError';

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body:   req.body,
      params: req.params,
      query:  req.query,
    });

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field:   issue.path.slice(1).join('.'),
        message: issue.message,
      }));

      next(new ValidationError(details));
      return;
    }

    const data = result.data as {
      body?:   unknown;
      params?: unknown;
      query?:  unknown;
    };

    // body y params sí se pueden asignar
    if (data.body   !== undefined) req.body   = data.body;
    if (data.params !== undefined) req.params = data.params as Request['params'];

    // En Express 5, req.query es un getter dinámico — no se puede mutar
    // sus propiedades porque cada acceso reparsea la query string.
    // Usamos defineProperty para sobrescribir el getter con el objeto ya
    // coercido por Zod (importante para z.coerce.number(), z.coerce.boolean()).
    if (data.query !== undefined) {
      Object.defineProperty(req, 'query', {
        value: data.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}