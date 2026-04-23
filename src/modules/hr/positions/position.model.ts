import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type { PositionDocument } from './position.types';

export function getPositionCollection(): Collection<PositionDocument> {
  return getDb().collection<PositionDocument>('positions');
}

export async function createPositionIndexes(): Promise<void> {
  const collection = getPositionCollection();

  await collection.createIndexes([
    // Listado por org
    { key: { orgId: 1, isActive: 1 }, name: 'orgId_isActive' },
    // key único por org
    { key: { orgId: 1, key: 1 }, unique: true, name: 'orgId_key_unique' },
    // Orden por nombre
    { key: { orgId: 1, name: 1 }, name: 'orgId_name' },
  ]);

  logger.info('✅  Position indexes created');
}
