import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { env } from '../config/env';
import { getRedisClient } from '../config/redis';

function makeStore(prefix: string): RedisStore {
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      getRedisClient().call(args[0], ...args.slice(1)) as Promise<number>,
    prefix,
  });
}

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_AUTH,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests — please try again later',
      },
    });
  },
});

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_API,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: makeStore('rl:api:'),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests — please try again later',
      },
    });
  },
});