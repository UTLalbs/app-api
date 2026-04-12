import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type { DocumentCatalogDocument } from './document-catalog.types';

export function getDocumentCatalogCollection(): Collection<DocumentCatalogDocument> {
  return getDb().collection<DocumentCatalogDocument>('document_catalog');
}

export async function createDocumentCatalogIndexes(): Promise<void> {
  const collection = getDocumentCatalogCollection();

  await collection.createIndexes([
    // Listado por org
    {
      key:  { orgId: 1, isActive: 1 },
      name: 'orgId_isActive',
    },
    // Listado por org y categoría
    {
      key:  { orgId: 1, category: 1 },
      name: 'orgId_category',
    },
    // type único por org
    {
      key:    { orgId: 1, type: 1 },
      unique: true,
      name:   'orgId_type_unique',
    },
    // Filtrar por isSystem
    {
      key:  { orgId: 1, isSystem: 1 },
      name: 'orgId_isSystem',
    },
  ]);

  logger.info('✅  Document catalog indexes created');
}