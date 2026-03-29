import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { NotificationDocument } from './notification.types';

export function getNotificationCollection(): Collection<NotificationDocument> {
  return getDb().collection<NotificationDocument>('notifications');
}

export async function createNotificationIndexes(): Promise<void> {
  const collection = getNotificationCollection();

  await collection.createIndexes([
    // Notificaciones de un usuario — leídas/no leídas
    {
      key: { userId: 1, read: 1 },
      name: 'userId_read',
    },
    // Notificaciones de un usuario — ordenadas por fecha
    {
      key: { userId: 1, createdAt: -1 },
      name: 'userId_createdAt',
    },
  ]);

  logger.info('✅  Notification indexes created');
}