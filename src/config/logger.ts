import pino from 'pino';

import { env } from './env';

const isDevelopment = env.NODE_ENV === 'development';

const VERBOSE_LEVELS = new Set(['debug', 'trace']);
export const isVerbose = VERBOSE_LEVELS.has(env.LOG_LEVEL);

export const logger = pino({
  level: env.LOG_LEVEL,

  ...(isDevelopment && {
    transport: {
      target: isVerbose
        ? 'pino-pretty'
        : './logger.transport',
      options: isVerbose
        ? {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          }
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