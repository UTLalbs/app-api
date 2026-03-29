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
  {
    key: { userId: 1, read: 1 },
    name: 'userId_read',
  },
  {
    key: { userId: 1, createdAt: -1 },
    name: 'userId_createdAt',
  },
  // TTL — eliminar notificaciones después de 30 días
  {
    key: { expiresAt: 1 },
    name: 'ttl_30_days',
    expireAfterSeconds: 0,
  },
]);

  logger.info('✅  Notification indexes created');
}