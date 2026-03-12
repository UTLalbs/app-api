import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { RoleDocument } from './role.types';

export function getRoleCollection(): Collection<RoleDocument> {
  return getDb().collection<RoleDocument>('roles');
}

export async function createRoleIndexes(): Promise<void> {
  const collection = getRoleCollection();

  await collection.createIndexes([
    {
      key: { name: 1, orgId: 1 },
      unique: true,
      name: 'name_orgId_unique',
    },
    {
      key: { orgId: 1 },
      name: 'orgId',
    },
    {
      key: { isSystem: 1 },
      name: 'isSystem',
    },
  ]);

  logger.info('✅  Role indexes created');
}