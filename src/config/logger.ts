// src/config/logger.ts
import pino from 'pino';

import { env } from './env';

const isDevelopment = env.NODE_ENV === 'development';
const isVerbose     = env.LOG_VERBOSE === 'true';

export const logger = pino({
  level: env.LOG_LEVEL,

  ...(isDevelopment && {
    transport: {
      target: isVerbose
        ? 'pino-pretty'                            // verbose: comportamiento default
        : './logger.transport',                    // compacto: nuestro transport
      options: isVerbose
        ? { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
        : {},
    },
  }),

  base: { env: env.NODE_ENV },

  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});