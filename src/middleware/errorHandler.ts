import type { NextFunction, Request, Response } from 'express';
import { MongoError, MongoServerError } from 'mongodb';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../shared/errors/AppError';


interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  // ── Error operacional conocido (AppError y subclases) ──────────────────────
  if (err instanceof AppError && err.isOperational) {
    logger.warn(
      { err, requestId, path: req.path, method: req.method },
      `Operational error: ${err.code}`,
    );

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // ── Duplicate key de MongoDB (código 11000) ────────────────────────────────
  if (err instanceof MongoServerError && err.code === 11000) {
    logger.warn({ err, requestId }, 'MongoDB duplicate key error');

    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // ── Error genérico de MongoDB (conexión, timeout, etc.) ───────────────────
  if (err instanceof MongoError) {
    logger.error({ err, requestId }, 'MongoDB error');

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database temporarily unavailable',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // ── Error no controlado — nunca exponer detalles en producción ────────────
  logger.error(
    { err, requestId, path: req.path, method: req.method },
    'Unhandled error',
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  } satisfies ErrorResponse);
}