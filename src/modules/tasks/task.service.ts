import {ObjectId} from "mongodb";

import {env} from "../../config/env";
import {logger} from "../../config/logger";
import {USER_TYPE} from "../../shared/constants";
import {ForbiddenError, NotFoundError} from "../../shared/errors/AppError";
import {computeDiff} from "../../shared/utils/diff";
import {emitAuditEvent} from "../audit/audit.service";
import type {AuditContext} from "../audit/audit.types";
import {deleteNotificationsByTaskId} from "../notifications/notification.repository";
import {createNotification} from "../notifications/notification.service";
import {findSuperAdmins} from "../users/user.repository";

import {
	findDuplicateTask,
	createTask,
	findTaskById,
	findAllTasks,
	updateTask,
	updateTaskAssignedBy,
	deleteTask,
	findTaskDocumentById,
} from "./task.repository";
import type {
	CreateTaskDto,
	Task,
	TaskQueryFilter,
	UpdateTaskDto,
} from "./task.types";

const TASK_UPDATABLE_FIELDS = [
	"status",
	"priority",
	"assignedTo",
	"participants",
	"dueDate",
] as const satisfies readonly (keyof UpdateTaskDto)[];

// ── Notificación alta prioridad ────────────────────────────────────────────

async function notifyHighPriority(task: Task): Promise<void> {
	try {
		logger.warn(
			{
				taskId: task.id,
				title: task.title,
				priority: task.priority,
				area: task.area,
				entity: task.entityName,
				developerEmail: env.DEVELOPER_EMAIL,
			},
			"🚨 High/Critical priority task created",
		);
		// TODO: email / webhook cuando se implemente
	} catch (err) {
		logger.error({err}, "Failed to send high priority notification");
	}
}

// ── Crear task ─────────────────────────────────────────────────────────────

export async function submitTask(
	dto: CreateTaskDto,
	actorName: string,
	context: AuditContext,
): Promise<{task: Task; isDuplicate: boolean}> {
	// Deduplicación por sourceId
	if (dto.sourceId) {
		const duplicate = await findDuplicateTask(dto.sourceId);
		if (duplicate) {
			logger.info(
				{existingId: duplicate.id, sourceId: dto.sourceId},
				"Duplicate task detected — returning existing",
			);
			return {task: duplicate, isDuplicate: true};
		}
	}

	const task = await createTask(dto);

	// Notificar al asignado
	if (dto.assignedTo) {
		await createNotification({
			userId: dto.assignedTo,
			orgId: dto.orgId,
			type: "assignment",
			taskId: task.id,
			taskTitle: task.title,
			message: `${actorName} te asignó el task: ${task.title}`,
			fromUserId: dto.assignedBy ?? dto.createdBy,
			fromUserName: actorName,
		});
	}

	logger.info(
		{taskId: task.id, type: task.type, priority: task.priority},
		"Task created",
	);

	if (dto.type === "error_report" || dto.source === "system") {
		const superAdmins = await findSuperAdmins();

		await Promise.all(
			superAdmins.map((admin) =>
				createNotification({
					userId: admin.id,
					orgId: null,
					type: "system",
					taskId: task.id,
					taskTitle: task.title,
					message: `Nuevo reporte de error: ${task.title}`,
					fromUserId: dto.assignedBy,
					fromUserName: actorName,
				}),
			),
		);
	}

	// Notificar si es alta prioridad — fire and forget
	if (task.priority === "critical" || task.priority === "high") {
		notifyHighPriority(task).catch((err) =>
			logger.error({err}, "notifyHighPriority fire-and-forget failed"),
		);
	}

	await emitAuditEvent({
		category: "tasks",
		action: "task_created",
		target: {type: "task", id: task.id, displayName: task.title},
		metadata: {
			type: task.type,
			priority: task.priority,
			area: task.area,
			assignedTo: task.assignedTo?.id ?? null,
		},
		context,
	});

	return {task, isDuplicate: false};
}

// ── Obtener task por ID ────────────────────────────────────────────────────

export async function getTask(id: string): Promise<Task> {
	const task = await findTaskById(id);
	if (!task) throw new NotFoundError("Task");
	return task;
}

// ── Listar tasks ───────────────────────────────────────────────────────────

export async function listTasks(
	filter: TaskQueryFilter,
	accessFilter: Record<string, unknown>,
): Promise<{tasks: Task[]; total: number}> {
	return findAllTasks(filter, accessFilter);
}

// ── Actualizar task ────────────────────────────────────────────────────────

export async function editTask(
	id: string,
	dto: UpdateTaskDto,
	actorId: string,
	actorName: string,
	actorType: string,
	context: AuditContext,
): Promise<Task> {
	// Obtener task antes de actualizar — para comparar cambios
	const before = await findTaskDocumentById(id);
	if (!before) throw new NotFoundError("Task");

	// Ownership: super_admin bypass, el resto debe ser creador/asignado/participante
	if (actorType !== USER_TYPE.SUPER_ADMIN) {
		const actor = new ObjectId(actorId);
		const isInvolved =
			before.createdBy.equals(actor) ||
			before.assignedTo?.equals(actor) ||
			before.assignedBy?.equals(actor) ||
			before.participants.some((p) => p.equals(actor));

		if (!isInvolved) {
			throw new ForbiddenError("No tienes permiso para editar este task");
		}
	}

	const updated = await updateTask(id, dto);
	if (!updated) throw new NotFoundError("Task");

	// ── Notificar al resolver ──────────────────────────────────────────────
	if (dto.status === "resolved") {
		const notifyIds: string[] = [];

		if (updated.assignedTo) notifyIds.push(updated.assignedTo.id);

		// assignedBy puede ser null
		const assignedByStr = before.assignedBy?.toHexString();
		if (assignedByStr && !notifyIds.includes(assignedByStr)) {
			notifyIds.push(assignedByStr);
		}

		// Notificar también al createdBy
		const createdByStr = before.createdBy.toHexString();
		if (!notifyIds.includes(createdByStr)) {
			notifyIds.push(createdByStr);
		}

		await Promise.all(
			notifyIds.map((userId) =>
				createNotification({
					userId,
					orgId: updated.orgId,
					type: "status_change",
					taskId: updated.id,
					taskTitle: updated.title,
					message: `Task completado: ${updated.title}`,
					fromUserId: actorId,
					fromUserName: actorName,
				}),
			),
		);
	}

	// ── Notificar cambio de asignado ───────────────────────────────────────
	const assignedToChanged =
		dto.assignedTo !== undefined &&
		dto.assignedTo !== before.assignedTo?.toHexString();

	if (assignedToChanged) {
		await updateTaskAssignedBy(id, actorId);

		if (dto.assignedTo) {
			await createNotification({
				userId: dto.assignedTo,
				orgId: updated.orgId,
				type: "assignment",
				taskId: updated.id,
				taskTitle: updated.title,
				message: `${actorName} te asignó el task: ${updated.title}`,
				fromUserId: actorId,
				fromUserName: actorName,
			});
		}
	}

	// ── Notificar cambio de status al asignado y participants ──────────────
	const statusChanged =
		dto.status !== undefined && dto.status !== before.status;

	if (statusChanged && dto.status !== "resolved") {
		// resolved ya se notificó arriba con mensaje diferente
		const notifyUserIds: string[] = [];

		if (updated.assignedTo) notifyUserIds.push(updated.assignedTo.id);

		updated.participants.forEach((p) => {
			if (!notifyUserIds.includes(p.id)) notifyUserIds.push(p.id);
		});

		await Promise.all(
			notifyUserIds.map((userId) =>
				createNotification({
					userId,
					orgId: updated.orgId,
					type: "status_change",
					taskId: updated.id,
					taskTitle: updated.title,
					message: `Task "${updated.title}" cambió a ${dto.status}`,
					fromUserId: actorId,
					fromUserName: actorName,
				}),
			),
		);
	}

	logger.info({taskId: id, actorId}, "Task updated");

	const diff = computeDiff<UpdateTaskDto>(
		{
			status: before.status,
			priority: before.priority,
			assignedTo: before.assignedTo?.toHexString() ?? null,
			participants: before.participants.map((p) => p.toHexString()),
			dueDate: before.dueDate ? before.dueDate.toISOString() : null,
		},
		{
			status: updated.status,
			priority: updated.priority,
			assignedTo: updated.assignedTo?.id ?? null,
			participants: updated.participants.map((p) => p.id),
			dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
		},
		{allowedFields: TASK_UPDATABLE_FIELDS},
	);

	const auditAction =
		dto.status === "resolved"
			? "task_resolved"
			: assignedToChanged
				? "task_reassigned"
				: "task_updated";

	await emitAuditEvent({
		category: "tasks",
		action: auditAction,
		target: {type: "task", id, displayName: updated.title},
		diff: diff ?? undefined,
		context,
	});

	return updated;
}

// ── Eliminar task ──────────────────────────────────────────────────────────

export async function removeTask(
	id: string,
	context: AuditContext,
): Promise<void> {
	const before = await findTaskDocumentById(id);

	const deleted = await deleteTask(id);
	if (!deleted) throw new NotFoundError("Task");

	// Eliminar todas las notificaciones asociadas
	await deleteNotificationsByTaskId(id);

	logger.info({taskId: id}, "Task and notifications deleted");

	if (before) {
		await emitAuditEvent({
			category: "tasks",
			action: "task_deleted",
			target: {type: "task", id, displayName: before.title},
			context,
		});
	}
}
