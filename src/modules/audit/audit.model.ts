import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { AuditDocument } from './audit.types';

export function getAuditCollection(): Collection<AuditDocument> {
  return getDb().collection<AuditDocument>('audit_logs');
}

export async function createAuditIndexes(): Promise<void> {
  const collection = getAuditCollection();

  await collection.createIndexes([
    // Buscar por actor (quién hizo la acción)
    {
      key: { 'actor.id': 1, createdAt: -1 },
      name: 'actor_date',
    },
    // Buscar por entidad afectada
    {
      key: { 'target.id': 1, createdAt: -1 },
      name: 'target_date',
    },
    // Buscar por organización y fecha
    {
      key: { orgId: 1, createdAt: -1 },
      name: 'orgId_date',
    },
    // Buscar por categoría y acción
    {
      key: { category: 1, action: 1, createdAt: -1 },
      name: 'category_action_date',
    },
    // TTL — los logs expiran después de 1 año (365 días)
    // Ajusta según tus requisitos de retención
    {
      key: { createdAt: 1 },
      name: 'ttl_expiry',
      expireAfterSeconds: 60 * 60 * 24 * 365,
    },
  ]);

  logger.info('✅  Audit indexes created');
}