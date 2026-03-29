import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';

import {
  getNotifications,
  updateNotificationRead,
  markAllRead,
} from './notification.controller';
import {
  listNotificationsSchema,
  updateNotificationReadSchema,
} from './notification.validator';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// GET /api/v1/notifications
notificationRouter.get(
  '/',
  validate(listNotificationsSchema),
  getNotifications,
);

// PATCH /api/v1/notifications/read-all
// ← debe ir ANTES de /:id para evitar conflicto de rutas
notificationRouter.patch(
  '/read-all',
  markAllRead,
);

// PATCH /api/v1/notifications/:id/read
notificationRouter.patch(
  '/:id/read',
  validate(updateNotificationReadSchema),
  updateNotificationRead,
);