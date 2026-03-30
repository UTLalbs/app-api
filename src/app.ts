import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { getMongoClient } from './config/database';
import { env } from './config/env';
import { getRedisClient } from './config/redis';
import { openApiDocument } from './docs/openapi';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { requestId } from './middleware/requestId';
import { authRouter } from './modules/auth/auth.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { organizationRouter } from './modules/organizations/organization.routes';
import { roleRouter } from './modules/roles/role.routes';
import { taskRouter } from './modules/tasks/task.routes';
import { taxRouter } from './modules/tax/tax.routes';
import { userRouter } from './modules/users/user.routes';

export function createApp(httpLogger: RequestHandler): express.Application {
  const app = express();

  app.set('etag', false);

  // ── Seguridad ──────────────────────────────────────────────────────────────
  app.use(helmet());

  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // ── Parsers ────────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // ── Observabilidad ─────────────────────────────────────────────────────────
  app.use(requestId);
  app.use(httpLogger); // ← recibido desde server.ts

  // ── Health checks ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (_req, res) => {
    const checks = await Promise.allSettled([
      getMongoClient().db('admin').command({ ping: 1 }),
      getRedisClient().ping(),
    ]);

    const dbOk    = checks[0].status === 'fulfilled';
    const redisOk = checks[1].status === 'fulfilled';
    const ready   = dbOk && redisOk;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not ready',
      checks: {
        database: dbOk    ? 'ok' : 'error',
        redis:    redisOk ? 'ok' : 'error',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ── API routes ─────────────────────────────────────────────────────────────
  app.use('/api/v1/auth',          authRouter);
  app.use('/api/v1/organizations', organizationRouter);
  app.use('/api/v1/roles',         apiLimiter, roleRouter);
  app.use('/api/v1/users',         userRouter);
  app.use('/api/v1/tax',           apiLimiter, taxRouter);
  app.use('/api/v1/tasks',         apiLimiter, taskRouter);
  app.use('/api/v1/notifications', apiLimiter, notificationRouter);

  // ── Swagger UI ─────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'production') {
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, {
        customSiteTitle: 'UTL API Docs',
        swaggerOptions: { persistAuthorization: true },
      }),
    );
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ── Error handler (siempre el último) ──────────────────────────────────────
  app.use(errorHandler);

  return app;
}