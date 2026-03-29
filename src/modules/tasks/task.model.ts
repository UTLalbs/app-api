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
    // Deduplicación por sourceId
    {
      key: { sourceId: 1 },
      sparse: true,
      name: 'sourceId',
    },
    // Tasks asignados a un usuario
    {
      key: { assignedTo: 1 },
      sparse: true,
      name: 'assignedTo',
    },
    // Participants
    {
      key: { participants: 1 },
      sparse: true,
      name: 'participants',
    },
    // Ordenamiento por fecha
    {
      key: { createdAt: -1 },
      name: 'createdAt_desc',
    },
  ]);

  logger.info('✅  Task indexes created');
}