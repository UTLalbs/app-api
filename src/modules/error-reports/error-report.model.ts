import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { ErrorReportDocument } from './error-report.types';

export function getErrorReportCollection(): Collection<ErrorReportDocument> {
  return getDb().collection<ErrorReportDocument>('error_reports');
}

export async function createErrorReportIndexes(): Promise<void> {
  const collection = getErrorReportCollection();

  await collection.createIndexes([
    // Deduplicación — entityId + fecha
    {
      key: { entityId: 1, createdAt: -1 },
      name: 'entityId_createdAt',
    },
    // Listado por status
    {
      key: { status: 1, createdAt: -1 },
      name: 'status_createdAt',
    },
    // Filtro por organización
    {
      key: { orgId: 1, createdAt: -1 },
      name: 'orgId_createdAt',
    },
    // Quién reportó
    {
      key: { reportedBy: 1 },
      sparse: true,
      name: 'reportedBy',
    },
    // TTL — eliminar reportes de más de 90 días automáticamente
    {
      key: { createdAt: 1 },
      name: 'ttl_90_days',
      expireAfterSeconds: 60 * 60 * 24 * 90,
    },
  ]);

  logger.info('✅  Error report indexes created');
}