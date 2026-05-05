// Helpers para materializar `ScheduleAssignment` a partir del `workSchedule`
// del empleado. Vivían en time-clock.service.ts pero se extraen acá para que
// también puedan invocarse desde time-clock-day.service.ts (al listar Days
// para revisión, sin esperar a que el empleado fichaje) sin crear un ciclo.
//
import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { getUserCollection } from '../../users/user.model';
import { dayShiftToWorkPeriodDto } from '../employees/employee.service';
import type {
  DayOfWeek,
  DayShiftDocument,
  EmployeeWorkScheduleDocument,
} from '../employees/employee.types';
import { getOrgTimezone } from '../../organizations/organization.service';
import {
  createAssignment,
  findAssignmentsByUserAndDate,
  findTemplateById,
} from '../schedules/schedule.repository';

import { workDateInTimezone } from './overtime.helpers';

const JS_DAY_TO_NAME: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

export interface MaterializeEmployee {
  id: string;
  displayName: string;
  position: string | null;
}

export interface MaterializeActor {
  id: string;
  displayName: string;
}

// Si el empleado tiene workSchedule.fixed y no hay Assignment para la fecha,
// crea uno. Idempotente: si ya existe, no-op. Si falla (no es empleado, no
// tiene workSchedule, faltan locations, race), tampoco lanza.
export async function tryMaterializeFromWorkSchedule(
  orgId: string,
  userId: string,
  eventDate: Date,
  employee: MaterializeEmployee,
  actor: MaterializeActor,
): Promise<void> {
  // El workDate corresponde al día LOCAL del org. Un evento a las 6 PM Mexico
  // (00 UTC del día siguiente) pertenece al día Mexico, no al día UTC.
  const orgTimezone = await getOrgTimezone(orgId);
  const workDate = workDateInTimezone(eventDate, orgTimezone);

  const existing = await findAssignmentsByUserAndDate(orgId, userId, workDate);
  if (existing.length > 0) return;

  const userDoc = await getUserCollection().findOne(
    {
      _id: new ObjectId(userId),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { projection: { 'employeeProfile.workSchedule': 1 } },
  );

  const ws = userDoc?.employeeProfile?.workSchedule as
    | EmployeeWorkScheduleDocument
    | null
    | undefined;
  if (!ws) return;
  if (ws.mode === 'task_based') return;

  const dayName = JS_DAY_TO_NAME[workDate.getUTCDay()];
  if (ws.restDays?.includes(dayName)) return;

  let shift: DayShiftDocument | null = null;
  if (ws.customPattern && ws.customPattern[dayName]) {
    shift = ws.customPattern[dayName];
  } else if (ws.templateId) {
    const tplId =
      ws.templateId instanceof ObjectId
        ? ws.templateId.toHexString()
        : String(ws.templateId);
    const tpl = await findTemplateById(tplId, orgId);
    if (tpl) {
      shift = {
        shiftType: tpl.shiftType,
        startTime: tpl.defaultStartTime,
        endTime: tpl.defaultEndTime,
        multiDay: tpl.shiftType === 'multi_day',
        endDayOffset: tpl.shiftType === 'multi_day' ? 1 : 0,
        startLocationId: tpl.defaultStartLocationId
          ? new ObjectId(tpl.defaultStartLocationId)
          : null,
        endLocationId: tpl.defaultEndLocationId
          ? new ObjectId(tpl.defaultEndLocationId)
          : tpl.defaultStartLocationId
            ? new ObjectId(tpl.defaultStartLocationId)
            : null,
        applyAutoBreak: tpl.applyAutoBreak,
        breakDurationMinutes: tpl.breakDurationMinutes,
        breakStartTime: null,
        breakEndTime: null,
        notes: null,
      };
    }
  }

  if (!shift) return;

  const periodDto = dayShiftToWorkPeriodDto(shift);
  if (!periodDto) {
    logger.warn(
      { userId, workDate: workDate.toISOString(), dayName },
      'Auto-materialize skipped: workSchedule sin ubicaciones para este día',
    );
    return;
  }

  try {
    const fromTemplateId = ws.templateId
      ? ws.templateId instanceof ObjectId
        ? ws.templateId.toHexString()
        : String(ws.templateId)
      : null;
    await createAssignment({
      userId,
      workDate,
      periods: [periodDto],
      fromTemplateId,
      notes: null,
      orgId,
      createdBy: actor.id,
      createdByName: actor.displayName,
      userName: employee.displayName,
      userPosition: employee.position ?? null,
    });
    logger.info(
      { userId, workDate: workDate.toISOString() },
      'Auto-materialized ScheduleAssignment from workSchedule',
    );
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      'Auto-materialize falló (probablemente race); continuamos sin schedule',
    );
  }
}

// Bulk: para cada empleado activo del org con workSchedule.fixed, materializa
// los Assignments faltantes en el rango [start, end]. Llamado al listar Days
// para revisión, así el gerente ve "sin fichar" sin esperar a que el empleado
// abra su app.
//
// Cost: O(employees × days). Idempotente — si Assignment ya existe, skip.
export async function materializeAllForRange(
  orgId: string,
  start: Date,
  end: Date,
  actor: MaterializeActor,
): Promise<void> {
  const users = await getUserCollection()
    .find(
      {
        orgId: new ObjectId(orgId),
        deletedAt: null,
        'employeeProfile.isEmployee': true,
        'employeeProfile.workSchedule.mode': 'fixed',
      },
      {
        projection: {
          _id: 1,
          displayName: 1,
          'employeeProfile.position': 1,
        },
      },
    )
    .toArray();

  if (users.length === 0) return;

  // Truncar a UTC-midnight para iterar día por día. Cada llamada a
  // tryMaterializeFromWorkSchedule localiza al timezone de la org.
  const startDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const endDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );

  for (const u of users) {
    const employee: MaterializeEmployee = {
      id: u._id.toHexString(),
      displayName: u.displayName ?? '—',
      position: u.employeeProfile?.position ?? null,
    };
    const cursor = new Date(startDay);
    while (cursor <= endDay) {
      await tryMaterializeFromWorkSchedule(
        orgId,
        employee.id,
        new Date(cursor),
        employee,
        actor,
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
}
