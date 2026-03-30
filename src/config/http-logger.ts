import { env } from './env';
import { logger } from './logger';

const VERBOSE_LEVELS = new Set(['debug', 'trace']);
const isVerbose = VERBOSE_LEVELS.has(env.LOG_LEVEL);

export const httpLoggerOptions = {
  logger,

  // Qué nivel usar por status code
  customLogLevel: (_req: unknown, res: { statusCode: number }, err: unknown) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
  },

  // Mensaje compacto en lugar de "request completed"
  customSuccessMessage: (req: { method: string; url: string }, res: { statusCode: number }) =>
    `${req.method} ${req.url} → ${res.statusCode}`,

  customErrorMessage: (req: { method: string; url: string }, res: { statusCode: number }) =>
    `${req.method} ${req.url} → ${res.statusCode}`,

  // Serializers: compacto vs verbose
  serializers: isVerbose
    ? {}  // pino-http defaults — todo expandido
    : {
        req: (req: Record<string, unknown>) => ({
          method: req.method,
          url:    req.url,
        }),
        res: (res: Record<string, unknown>) => ({
          statusCode: res.statusCode,
        }),
      },
};