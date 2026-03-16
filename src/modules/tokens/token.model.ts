import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { TokenDocument } from './token.types';

export function getTokenCollection(): Collection<TokenDocument> {
  return getDb().collection<TokenDocument>('tokens');
}

export async function createTokenIndexes(): Promise<void> {
  const collection = getTokenCollection();

  await collection.createIndexes([
    // token único global
    {
      key: { token: 1 },
      unique: true,
      name: 'token_unique',
    },
    // buscar tokens de un usuario por tipo
    {
      key: { userId: 1, type: 1 },
      name: 'userId_type',
    },
    // TTL — MongoDB elimina automáticamente documentos expirados
    {
      key: { expiresAt: 1 },
      name: 'ttl_expiry',
      expireAfterSeconds: 0,
    },
  ]);

  logger.info('✅  Token indexes created');
}