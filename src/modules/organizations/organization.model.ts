import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { OrganizationDocument } from './organization.types';

export function getOrganizationCollection(): Collection<OrganizationDocument> {
  return getDb().collection<OrganizationDocument>('organizations');
}

export async function createOrganizationIndexes(): Promise<void> {
  const collection = getOrganizationCollection();

  await collection.createIndexes([
    // slug único global — inmutable una vez creado
    {
      key: { slug: 1 },
      unique: true,
      name: 'slug_unique',
    },
    // búsquedas por status + fecha
    {
      key: { status: 1, createdAt: -1 },
      name: 'status_createdAt',
    },
    // soft delete
    {
      key: { deletedAt: 1 },
      name: 'deletedAt',
    },
  ]);

  logger.info('✅  Organization indexes created');
}