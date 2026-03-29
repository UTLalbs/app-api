import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { TaskDocument } from './task.types';

export function getTaskCollection(): Collection<TaskDocument> {
  return getDb().collection<TaskDocument>('tasks');
}

export async function createTaskIndexes(): Promise<void> {
  const collection = getTaskCollection();

await collection.createIndexes([
  // Buscar tasks por org y status
  {
    key: { orgId: 1, status: 1 },
    name: 'orgId_status',
  },
  // Buscar tasks por org y area
  {
    key: { orgId: 1, area: 1 },
    name: 'orgId_area',
  },
  // Quién creó el task
  {
    key: { orgId: 1, assignedBy: 1 },
    name: 'orgId_assignedBy',
  },
  // A quién fue asignado
  {
    key: { orgId: 1, assignedTo: 1 },
    name: 'orgId_assignedTo',
    sparse: true,
  },
  // Participantes
  {
    key: { orgId: 1, participants: 1 },
    name: 'orgId_participants',
    sparse: true,
  },
  // Deduplicación por sourceId
  {
    key: { sourceId: 1 },
    sparse: true,
    name: 'sourceId',
  },
  // Ordenamiento por fecha
  {
    key: { createdAt: -1 },
    name: 'createdAt_desc',
  },
]);
  logger.info('✅  Task indexes created');
}