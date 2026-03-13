import type { Request, Response, NextFunction } from 'express';

import { errorHandler } from '../../../middleware/errorHandler';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../shared/errors/AppError';

// Mock de req, res, next|
function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = jest.fn() as NextFunction;

describe('errorHandler middleware', () => {
  it('maneja AuthError con status 401', () => {
    const res = makeRes();
    const err = new AuthError('No access token');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTH_ERROR' }),
      }),
    );
  });

  it('maneja ForbiddenError con status 403', () => {
    const res = makeRes();
    const err = new ForbiddenError('Sin permiso');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maneja NotFoundError con status 404', () => {
    const res = makeRes();
    const err = new NotFoundError('User');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maneja ValidationError con status 400', () => {
    const res = makeRes();
    const err = new ValidationError('Email inválido');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maneja ConflictError con status 409', () => {
    const res = makeRes();
    const err = new ConflictError('Email ya existe');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maneja errores desconocidos con status 500', () => {
    const res = makeRes();
    const err = new Error('Unexpected error');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
  });
});