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
    // Slug único — identificador URL-friendly
    {
      key: { slug: 1 },
      unique: true,
      name: 'slug_unique',
    },
    // Búsqueda por status
    {
      key: { status: 1 },
      name: 'status',
    },
    // Soft delete
    {
      key: { deletedAt: 1 },
      name: 'deletedAt',
    },
  ]);

  logger.info('✅  Organization indexes created');
}