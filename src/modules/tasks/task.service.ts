import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NotFoundError } from '../../shared/errors/AppError';
import { createNotification } from '../notifications/notification.service';

import {
  findDuplicateTask,
  createTask,
  findTaskById,
  findAllTasks,
  updateTask,
  deleteTask,
  findTaskDocumentById,
} from './task.repository';
import type {
  CreateTaskDto,
  Task,
  TaskQueryFilter,
  UpdateTaskDto,
} from './task.types';

// ── Notificación alta prioridad ────────────────────────────────────────────

async function notifyHighPriority(task: Task): Promise<void> {
  try {
    logger.warn(
      {
        taskId:    task.id,
        title:     task.title,
        priority:  task.priority,
        area:      task.area,
        entity:    task.entityName,
        developerEmail: env.DEVELOPER_EMAIL,
      },
      '🚨 High/Critical priority task created',
    );
    // TODO: email / webhook cuando se implemente
  } catch (err) {
    logger.error({ err }, 'Failed to send high priority notification');
  }
}

// ── Crear task ─────────────────────────────────────────────────────────────

export async function submitTask(
  dto: CreateTaskDto,
  actorName: string,
): Promise<{ task: Task; isDuplicate: boolean }> {

  // Deduplicación por sourceId
  if (dto.sourceId) {
    const duplicate = await findDuplicateTask(dto.sourceId);
    if (duplicate) {
      logger.info(
        { existingId: duplicate.id, sourceId: dto.sourceId },
        'Duplicate task detected — returning existing',
      );
      return { task: duplicate, isDuplicate: true };
    }
  }

  const task = await createTask(dto);

  logger.info(
    { taskId: task.id, type: task.type, priority: task.priority },
    'Task created',
  );

  // Notificar al asignado
  if (dto.assignedTo) {
    await createNotification({
      userId:       dto.assignedTo,
      orgId:        dto.orgId,
      type:         'assignment',
      taskId:       task.id,
      taskTitle:    task.title,
      message:      `${actorName} te asignó el task: ${task.title}`,
      fromUserId:   dto.assignedBy,
      fromUserName: actorName,
    });
  }

  // Notificar si es alta prioridad — fire and forget
  if (task.priority === 'critical' || task.priority === 'high') {
    notifyHighPriority(task).catch((err) =>
      logger.error({ err }, 'notifyHighPriority fire-and-forget failed'),
    );
  }

  return { task, isDuplicate: false };
}

// ── Obtener task por ID ────────────────────────────────────────────────────

export async function getTask(id: string): Promise<Task> {
  const task = await findTaskById(id);
  if (!task) throw new NotFoundError('Task');
  return task;
}

// ── Listar tasks ───────────────────────────────────────────────────────────

export async function listTasks(
  filter: TaskQueryFilter,
  accessFilter: Record<string, unknown>,
): Promise<{ tasks: Task[]; total: number }> {
  return findAllTasks(filter, accessFilter);
}

// ── Actualizar task ────────────────────────────────────────────────────────

export async function editTask(
  id: string,
  dto: UpdateTaskDto,
  actorId: string,
  actorName: string,
): Promise<Task> {
  // Obtener task antes de actualizar — para comparar cambios
  const before = await findTaskDocumentById(id);
  if (!before) throw new NotFoundError('Task');

  const updated = await updateTask(id, dto);
  if (!updated) throw new NotFoundError('Task');

  // Notificar cambio de asignado
  const assignedToChanged =
    dto.assignedTo !== undefined &&
    dto.assignedTo !== before.assignedTo?.toHexString();

  if (assignedToChanged && dto.assignedTo) {
    await createNotification({
      userId:       dto.assignedTo,
      orgId:        updated.orgId,
      type:         'assignment',
      taskId:       updated.id,
      taskTitle:    updated.title,
      message:      `${actorName} te asignó el task: ${updated.title}`,
      fromUserId:   actorId,
      fromUserName: actorName,
    });
  }

  // Notificar cambio de status al asignado y participants
  const statusChanged =
    dto.status !== undefined && dto.status !== before.status;

  if (statusChanged) {
    const notifyUserIds: string[] = [];

    if (updated.assignedTo) notifyUserIds.push(updated.assignedTo.id);

    updated.participants.forEach((p) => {
      if (!notifyUserIds.includes(p.id)) notifyUserIds.push(p.id);
    });

    await Promise.all(
      notifyUserIds.map((userId) =>
        createNotification({
          userId,
          orgId:        updated.orgId,
          type:         'status_change',
          taskId:       updated.id,
          taskTitle:    updated.title,
          message:      `Task "${updated.title}" cambió a ${dto.status}`,
          fromUserId:   actorId,
          fromUserName: actorName,
        }),
      ),
    );
  }

  logger.info({ taskId: id, actorId }, 'Task updated');

  return updated;
}

// ── Eliminar task ──────────────────────────────────────────────────────────

export async function removeTask(id: string): Promise<void> {
  const deleted = await deleteTask(id);
  if (!deleted) throw new NotFoundError('Task');
  logger.info({ taskId: id }, 'Task deleted');
}