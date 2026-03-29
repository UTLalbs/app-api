import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  listNotifications,
  readNotification,
  readAllNotifications,
} from './notification.service';
import type {
  ListNotificationsInput,
  UpdateNotificationReadInput,
} from './notification.validator';

// ── GET /api/v1/notifications ──────────────────────────────────────────────

export const getNotifications = asyncHandler(
  async (req: Request & ListNotificationsInput, res: Response) => {
    const read =
      req.query.read === 'true'
        ? true
        : req.query.read === 'false'
          ? false
          : undefined;

    const limit = Number(req.query.limit) || 20;

    const { notifications, total, unread } = await listNotifications(
      req.user!.id,
      { read, limit },
    );

    res.json({
      success: true,
      data: notifications,
      meta: { total, unread },
    });
  },
);

// ── PATCH /api/v1/notifications/:id/read ──────────────────────────────────

export const updateNotificationRead = asyncHandler(
  async (req: Request & UpdateNotificationReadInput, res: Response) => {
    const result = await readNotification(
      String(req.params.id),
      req.user!.id,
      req.body.read,
    );

    res.json({ success: true, data: result });
  },
);

// ── PATCH /api/v1/notifications/read-all ──────────────────────────────────

export const markAllRead = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await readAllNotifications(req.user!.id);
    res.json({ success: true, data: result });
  },
);