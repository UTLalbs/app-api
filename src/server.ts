import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { getRedisClient, disconnectRedis } from './config/redis';

async function bootstrap(): Promise<void> {
  // 1. Conectar base de datos
  await connectDatabase();

  // 2. Inicializar Redis (la conexión se establece al llamar getRedisClient)
  getRedisClient();

  // 3. Crear app Express
  const app = createApp();

  // 4. Levantar servidor HTTP
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀  Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Cuando Heroku o Docker manden SIGTERM, cerramos limpiamente
  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down gracefully...`);

    // Dejar de aceptar nuevas conexiones
    server.close(async () => {
      try {
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Forzar cierre si tarda más de 10s (evita colgarse)
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Capturar errores no manejados — loggear y salir limpiamente
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled Promise rejection');
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

bootstrap();
