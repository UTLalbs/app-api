import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'assignment'
  | 'status_change'
  | 'due_soon'
  | 'system';

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface NotificationDocument {
  _id:          ObjectId;
  userId:       ObjectId;
  orgId:        ObjectId | null;
  type:         NotificationType;
  taskId:       ObjectId;
  taskTitle:    string;
  message:      string;
  fromUserId:   ObjectId;
  fromUserName: string;
  read:         boolean;
  createdAt:    Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Notification {
  id:           string;
  userId:       string;
  orgId:        string | null;
  type:         NotificationType;
  taskId:       string;
  taskTitle:    string;
  message:      string;
  fromUserId:   string;
  fromUserName: string;
  read:         boolean;
  createdAt:    Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateNotificationDto {
  userId:       string;
  orgId:        string | null;
  type:         NotificationType;
  taskId:       string;
  taskTitle:    string;
  message:      string;
  fromUserId:   string;
  fromUserName: string;
}

export interface NotificationQueryFilter {
  read?:  boolean;
  limit?: number;
}