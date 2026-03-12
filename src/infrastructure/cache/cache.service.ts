import { logger } from '../../config/logger';
import { getRedisClient } from '../../config/redis';


// ── TTLs estándar ──────────────────────────────────────────────────────────
export const CacheTTL = {
  SHORT: 60,           // 1 minuto  — datos que cambian seguido
  MEDIUM: 60 * 5,      // 5 minutos — datos semi-estables
  LONG: 60 * 60,       // 1 hora    — datos estables
  DAY: 60 * 60 * 24,   // 24 horas  — catálogos / roles
} as const;

// ── Helpers de key ─────────────────────────────────────────────────────────
// Patrón: {módulo}:{recurso}:{id?}:{variante?}
// Ejemplos:
//   users:list:orgId123
//   users:one:userId456
//   roles:list:all
//   locations:one:locationId789

export const CacheKeys = {
  userList:         (orgId: string)      => `users:list:${orgId}`,
  userOne:          (id: string)         => `users:one:${id}`,
  orgList:          ()                   => `orgs:list:all`,
  orgOne:           (id: string)         => `orgs:one:${id}`,
  roleList:         ()                   => `roles:list:all`,
  roleOne:          (id: string)         => `roles:one:${id}`,
  locationList:     (orgId: string)      => `locations:list:${orgId}`,
  locationOne:      (id: string)         => `locations:one:${id}`,
  clientList:       (orgId: string)      => `clients:list:${orgId}`,
  clientOne:        (id: string)         => `clients:one:${id}`,
} as const;

// ── get ────────────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await getRedisClient().get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    // Cache miss por error no debe romper el flujo
    logger.warn({ key, err }, 'Cache get error — falling through to DB');
    return null;
  }
}

// ── set ────────────────────────────────────────────────────────────────────

export async function cacheSet<T>(
  key: string,
  value: T,
  ttl: number = CacheTTL.MEDIUM,
): Promise<void> {
  try {
    await getRedisClient().set(key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn({ key, err }, 'Cache set error — continuing without cache');
  }
}

// ── delete ─────────────────────────────────────────────────────────────────

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedisClient().del(key);
  } catch (err) {
    logger.warn({ key, err }, 'Cache delete error');
  }
}

// ── delete por patrón ──────────────────────────────────────────────────────
// Úsalo con cuidado en producción con datasets grandes
// Para invalidar todos los keys de un módulo: invalidatePattern('users:*')

export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const keys = await getRedisClient().keys(pattern);
    if (keys.length === 0) return;
    await getRedisClient().del(...keys);
    logger.debug({ pattern, count: keys.length }, 'Cache invalidated by pattern');
  } catch (err) {
    logger.warn({ pattern, err }, 'Cache invalidate pattern error');
  }
}

// ── getOrSet ───────────────────────────────────────────────────────────────
// Patrón cache-aside: lee cache, si no existe ejecuta fn y guarda el resultado
// Es el helper más usado en services

export async function getOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = CacheTTL.MEDIUM,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await fn();
  await cacheSet(key, value, ttl);
  return value;
}