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

    // query es readonly — copiar propiedades individualmente
    if (data.query !== undefined) {
      const parsedQuery = data.query as Record<string, unknown>;
      Object.keys(parsedQuery).forEach((key) => {
        (req.query as Record<string, unknown>)[key] = parsedQuery[key];
      });
    }

    next();
  };
}