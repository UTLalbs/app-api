import { logger } from '../../config/logger';
import { NotFoundError } from '../../shared/errors/AppError';

import {
  insertNotification,
  findUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notification.repository';
import type {
  CreateNotificationDto,
  Notification,
  NotificationQueryFilter,
} from './notification.types';

// ── Crear notificación ─────────────────────────────────────────────────────

export async function createNotification(
  dto: CreateNotificationDto,
): Promise<Notification> {
  const notification = await insertNotification(dto);

  logger.info(
    {
      notificationId: notification.id,
      userId:         notification.userId,
      type:           notification.type,
      taskId:         notification.taskId,
    },
    'Notification created',
  );

  return notification;
}

// ── Listar notificaciones del usuario ──────────────────────────────────────

export async function listNotifications(
  userId: string,
  filter: NotificationQueryFilter,
): Promise<{ notifications: Notification[]; total: number; unread: number }> {
  return findUserNotifications(userId, filter);
}

// ── Marcar como leída ──────────────────────────────────────────────────────

export async function readNotification(
  id: string,
  userId: string,
  read: boolean,
): Promise<{ id: string; read: boolean }> {
  const notification = await markNotificationRead(id, userId, read);

  if (!notification) throw new NotFoundError('Notification');

  logger.info({ notificationId: id, userId, read }, 'Notification updated');

  return { id: notification.id, read: notification.read };
}

// ── Marcar todas como leídas ───────────────────────────────────────────────

export async function readAllNotifications(
  userId: string,
): Promise<{ updated: number }> {
  const updated = await markAllNotificationsRead(userId);

  logger.info({ userId, updated }, 'All notifications marked as read');

  return { updated };
}