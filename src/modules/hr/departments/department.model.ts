import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type { DepartmentDocument } from './department.types';

export function getDepartmentCollection(): Collection<DepartmentDocument> {
  return getDb().collection<DepartmentDocument>('departments');
}

export async function createDepartmentIndexes(): Promise<void> {
  const collection = getDepartmentCollection();

  await collection.createIndexes([
    { key: { orgId: 1, isActive: 1 }, name: 'orgId_isActive' },
    { key: { orgId: 1, key: 1 }, unique: true, name: 'orgId_key_unique' },
    { key: { orgId: 1, name: 1 }, name: 'orgId_name' },
  ]);

  logger.info('✅  Department indexes created');
}
