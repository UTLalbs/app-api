import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';

import { ValidationError } from '../shared/errors/AppError';


export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Valida body, params y query en un solo paso
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Formatea los errores de zod en algo legible
        const details = err.issues.map((issue) => ({
          field: issue.path.slice(1).join('.'), // quita "body/params/query" del path
          message: issue.message,
        }));
        next(new ValidationError(details));
        return;
      }
      next(err);
    }
  };
}