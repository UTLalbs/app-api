import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { createNotification } from '../../notifications/notification.service';
import type { NotificationType } from '../../notifications/notification.types';
import { getRoleCollection } from '../../roles/role.model';
import { getUserCollection } from '../../users/user.model';

import type {
  TimeClockEvent,
  TimeClockEventDocument,
} from './time-clock.types';

interface NotificationActor {
  id: string;
  displayName: string;
}

// ── Resolver receptores ───────────────────────────────────────────────────

// Usuarios activos de la org con permiso `time_clocks:resolve` o
// `absences:approve` (gerencia HR). Se usa como fallback para fichajes que
// requieren atención y el empleado no tiene manager directo.
async function findHrApproverIds(orgId: string): Promise<string[]> {
  const orgObjectId = new ObjectId(orgId);
  const roles = await getRoleCollection()
    .find({
      $or: [{ orgId: orgObjectId }, { orgId: null, isSystem: true }],
      isActive: true,
      $and: [
        {
          permissions: {
            $elemMatch: {
              resource: 'time_clocks',
              actions: 'resolve',
            },
          },
        },
      ],
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

// Manager directo + gerencia HR (set para deduplicar).
async function gatherSupervisors(
  orgId: string,
  managerId: string | null,
  excludeId: string,
): Promise<string[]> {
  const set = new Set<string>();
  if (managerId && managerId !== excludeId) set.add(managerId);
  const hr = await findHrApproverIds(orgId);
  for (const id of hr) {
    if (id !== excludeId) set.add(id);
  }
  return [...set];
}

// ── Helper de bajo nivel ──────────────────────────────────────────────────

async function emitNotification(
  type: NotificationType,
  recipientId: string,
  event: TimeClockEventDocument | TimeClockEvent,
  actor: NotificationActor,
  message: string,
): Promise<void> {
  const orgId =
    'orgId' in event && typeof event.orgId === 'string'
      ? event.orgId
      : (event as TimeClockEventDocument).orgId.toHexString();
  const eventId =
    'id' in event && typeof event.id === 'string'
      ? event.id
      : (event as TimeClockEventDocument)._id.toHexString();
  const title =
    event.humanReadableId ??
    `${event.denormalizedRefs.userName} · ${event.type}`;

  try {
    await createNotification({
      userId: recipientId,
      orgId,
      type,
      taskId: eventId,
      taskTitle: title,
      message,
      fromUserId: actor.id,
      fromUserName: actor.displayName,
    });
  } catch (err) {
    logger.warn(
      { err, type, recipientId, eventId },
      'Failed to emit time-clock notification',
    );
  }
}

// ── Helpers públicos ──────────────────────────────────────────────────────

interface EmployeeMeta {
  id: string;
  managerId: string | null;
}

// Fichaje fuera de geocerca → manager + HR.
export async function notifyGeofenceAnomaly(
  event: TimeClockEventDocument,
  employee: EmployeeMeta,
  actor: NotificationActor,
): Promise<void> {
  const orgId = event.orgId.toHexString();
  const recipients = await gatherSupervisors(orgId, employee.managerId, employee.id);
  if (recipients.length === 0) return;
  const distance = event.distanceFromExpectedMeters ?? 0;
  const message = `${event.denormalizedRefs.userName} fichó a ${distance}m de la ubicación esperada (${event.denormalizedRefs.expectedLocationName ?? 'sin referencia'})`;
  await Promise.all(
    recipients.map((rid) =>
      emitNotification('clock_geofence_anomaly', rid, event, actor, message),
    ),
  );
}

// Fichaje creado manualmente por un supervisor → notificar al empleado.
export async function notifyManualCorrection(
  event: TimeClockEventDocument,
  actor: NotificationActor,
): Promise<void> {
  const employeeId = event.userId.toHexString();
  if (employeeId === actor.id) return;
  const message = `${actor.displayName} registró un fichaje en tu nombre (${event.type})`;
  await emitNotification(
    'clock_manual_correction',
    employeeId,
    event,
    actor,
    message,
  );
}

// Fichaje excluido → empleado + manager.
export async function notifyEventExcluded(
  event: TimeClockEventDocument,
  employee: EmployeeMeta,
  actor: NotificationActor,
): Promise<void> {
  const recipients = new Set<string>();
  recipients.add(event.userId.toHexString());
  if (employee.managerId && employee.managerId !== actor.id) {
    recipients.add(employee.managerId);
  }
  const reason = event.exclusionReason ?? 'sin razón especificada';
  const message = `Fichaje excluido (${event.type}) — ${reason}`;
  await Promise.all(
    [...recipients].map((rid) =>
      emitNotification('clock_event_excluded', rid, event, actor, message),
    ),
  );
}
