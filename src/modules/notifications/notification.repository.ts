import {ObjectId} from "mongodb";

import {getNotificationCollection} from "./notification.model";
import type {
	CreateNotificationDto,
	Notification,
	NotificationDocument,
	NotificationQueryFilter,
} from "./notification.types";

const NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

// ── Conversión documento → dominio ─────────────────────────────────────────

function toNotification(doc: NotificationDocument): Notification {
	return {
		id: doc._id.toHexString(),
		userId: doc.userId.toHexString(),
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
		type: doc.type,
		taskId: doc.taskId.toHexString(),
		taskTitle: doc.taskTitle,
		message: doc.message,
		fromUserId: doc.fromUserId.toHexString(),
		fromUserName: doc.fromUserName,
		read: doc.read,
		expiresAt: doc.expiresAt,
		createdAt: doc.createdAt,
	};
}

// ── Crear notificación ─────────────────────────────────────────────────────

export async function insertNotification(
	dto: CreateNotificationDto,
): Promise<Notification> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + NOTIFICATION_TTL_MS);

	const doc: Omit<NotificationDocument, "_id"> = {
		userId: new ObjectId(dto.userId),
		orgId: dto.orgId ? new ObjectId(dto.orgId) : null,
		type: dto.type,
		taskId: new ObjectId(dto.taskId),
		taskTitle: dto.taskTitle,
		message: dto.message,
		fromUserId: new ObjectId(dto.fromUserId),
		fromUserName: dto.fromUserName,
		read: false,
		expiresAt,
		createdAt: now,
	};

	const result = await getNotificationCollection().insertOne(
		doc as NotificationDocument,
	);

	return {
		id: result.insertedId.toHexString(),
		userId: dto.userId,
		orgId: dto.orgId,
		type: dto.type,
		taskId: dto.taskId,
		taskTitle: dto.taskTitle,
		message: dto.message,
		fromUserId: dto.fromUserId,
		fromUserName: dto.fromUserName,
		read: false,
		expiresAt,
		createdAt: now,
	};
}

// ── Listar notificaciones del usuario ──────────────────────────────────────

export async function findUserNotifications(
	userId: string,
	filter: NotificationQueryFilter,
): Promise<{notifications: Notification[]; total: number; unread: number}> {
	const query: Record<string, unknown> = {
		userId: new ObjectId(userId),
	};

	if (filter.read !== undefined) query.read = filter.read;

	const limit = Math.min(filter.limit ?? 20, 100);

	const [docs, total, unread] = await Promise.all([
		getNotificationCollection()
			.find(query)
			.sort({createdAt: -1})
			.limit(limit)
			.toArray(),
		getNotificationCollection().countDocuments({
			userId: new ObjectId(userId),
		}),
		getNotificationCollection().countDocuments({
			userId: new ObjectId(userId),
			read: false,
		}),
	]);

	return {
		notifications: docs.map((doc) =>
			toNotification(doc as NotificationDocument),
		),
		total,
		unread,
	};
}

// ── Marcar notificación como leída ────────────────────────────────────────

export async function markNotificationRead(
	id: string,
	userId: string,
	read: boolean,
): Promise<Notification | null> {
	if (!ObjectId.isValid(id)) return null;

	const result = await getNotificationCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			userId: new ObjectId(userId), // solo sus propias notificaciones
		},
		{$set: {read}},
		{returnDocument: "after"},
	);

	if (!result) return null;

	return toNotification(result as NotificationDocument);
}

// ── Marcar todas como leídas ───────────────────────────────────────────────

export async function markAllNotificationsRead(
	userId: string,
): Promise<number> {
	const result = await getNotificationCollection().updateMany(
		{userId: new ObjectId(userId), read: false},
		{$set: {read: true}},
	);

	return result.modifiedCount;
}

export async function deleteNotificationsByTaskId(
  taskId: string,
): Promise<void> {
  await getNotificationCollection().deleteMany({
    taskId: new ObjectId(taskId),
  });
}