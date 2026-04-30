import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { createNotification } from '../../notifications/notification.service';
import type { NotificationType } from '../../notifications/notification.types';
import { getRoleCollection } from '../../roles/role.model';
import { getUserCollection } from '../../users/user.model';

import type { AbsenceRequest, AbsenceRequestDocument } from './absence.types';

interface AbsenceNotificationActor {
  id: string;
  displayName: string;
}

// ── Helpers internos ──────────────────────────────────────────────────────

// Resuelve los IDs de usuarios que actualmente tienen permisos de aprobación
// sobre absences en la org (es decir, cualquier rol activo con
// resource='absences' + action='approve'). Útil cuando el empleado no tiene
// manager directo o cuando se requiere doble aprobación HR.
async function findHrApproverIds(orgId: string): Promise<string[]> {
  const orgObjectId = new ObjectId(orgId);
  const roles = await getRoleCollection()
    .find({
      $or: [{ orgId: orgObjectId }, { orgId: null, isSystem: true }],
      isActive: true,
      'permissions.resource': 'absences',
      'permissions.actions': 'approve',
    })
    .project({ _id: 1 })
    .toArray();

  if (roles.length === 0) return [];

  const roleIds = roles.map((r) => r._id);
  const users = await getUserCollection()
    .find({
      orgId: orgObjectId,
      status: 'active',
      deletedAt: null,
      'roles.roleId': { $in: roleIds },
    })
    .project({ _id: 1 })
    .toArray();

  return users.map((u) => u._id.toHexString());
}

async function emitNotification(
  type: NotificationType,
  recipientId: string,
  absence: AbsenceRequestDocument | AbsenceRequest,
  actor: AbsenceNotificationActor,
  message: string,
): Promise<void> {
  const orgId =
    'orgId' in absence && typeof absence.orgId === 'string'
      ? absence.orgId
      : (absence as AbsenceRequestDocument).orgId.toHexString();
  const absenceId =
    'id' in absence && typeof absence.id === 'string'
      ? absence.id
      : (absence as AbsenceRequestDocument)._id.toHexString();
  const title =
    absence.humanReadableId ??
    `${absence.denormalizedRefs.categoryName} · ${absence.denormalizedRefs.userName}`;

  try {
    await createNotification({
      userId: recipientId,
      orgId,
      type,
      taskId: absenceId,
      taskTitle: title,
      message,
      fromUserId: actor.id,
      fromUserName: actor.displayName,
    });
  } catch (err) {
    logger.warn({ err, type, recipientId, absenceId }, 'Failed to emit absence notification');
  }
}

// ── Helpers públicos ──────────────────────────────────────────────────────

export async function notifyAbsenceRequested(
  absence: AbsenceRequestDocument,
  actor: AbsenceNotificationActor,
): Promise<void> {
  const recipients = new Set<string>();
  const orgId = absence.orgId.toHexString();
  const managerId = absence.denormalizedRefs.userManagerId;
  if (managerId && managerId !== actor.id) recipients.add(managerId);

  const hrApprovers = await findHrApproverIds(orgId);
  for (const id of hrApprovers) {
    if (id !== actor.id) recipients.add(id);
  }

  const message = `Solicitud de ${absence.denormalizedRefs.categoryName.toLowerCase()} de ${absence.denormalizedRefs.userName} (${absence.totalDaysWorking} días hábiles)`;
  await Promise.all(
    [...recipients].map((rid) =>
      emitNotification('absence_requested', rid, absence, actor, message),
    ),
  );
}

export async function notifyAbsenceHrApprovalNeeded(
  absence: AbsenceRequestDocument,
  actor: AbsenceNotificationActor,
): Promise<void> {
  const orgId = absence.orgId.toHexString();
  const recipients = await findHrApproverIds(orgId);
  const message = `Aprobación HR pendiente — ${absence.denormalizedRefs.userName} solicita ${absence.totalDaysWorking} días de ${absence.denormalizedRefs.categoryName.toLowerCase()}`;
  await Promise.all(
    recipients
      .filter((rid) => rid !== actor.id)
      .map((rid) =>
        emitNotification(
          'absence_hr_approval_needed',
          rid,
          absence,
          actor,
          message,
        ),
      ),
  );
}

export async function notifyAbsenceApproved(
  absence: AbsenceRequestDocument,
  actor: AbsenceNotificationActor,
): Promise<void> {
  const employeeId = absence.userId.toHexString();
  const message = `Tu ${absence.denormalizedRefs.categoryName.toLowerCase()} fue aprobada por ${actor.displayName}`;
  await emitNotification(
    'absence_approved',
    employeeId,
    absence,
    actor,
    message,
  );
}

export async function notifyAbsenceRejected(
  absence: AbsenceRequestDocument,
  actor: AbsenceNotificationActor,
): Promise<void> {
  const employeeId = absence.userId.toHexString();
  const reason = absence.rejectionReason ?? 'Sin razón especificada';
  const message = `Tu ${absence.denormalizedRefs.categoryName.toLowerCase()} fue rechazada — ${reason}`;
  await emitNotification(
    'absence_rejected',
    employeeId,
    absence,
    actor,
    message,
  );
}

export async function notifyCoverageNeeded(
  absence: AbsenceRequestDocument,
  actor: AbsenceNotificationActor,
  affectedSchedulesCount: number,
): Promise<void> {
  const managerId = absence.denormalizedRefs.userManagerId;
  if (!managerId) return;
  const message = `Coverage requerido — ${absence.denormalizedRefs.userName} estará ausente en ${affectedSchedulesCount} turno(s)`;
  await emitNotification(
    'absence_coverage_needed',
    managerId,
    absence,
    actor,
    message,
  );
}
