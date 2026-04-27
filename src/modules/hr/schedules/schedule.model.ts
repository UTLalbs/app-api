import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type {
  ScheduleAssignmentDocument,
  ScheduleTemplateDocument,
} from './schedule.types';

export function getScheduleTemplateCollection(): Collection<ScheduleTemplateDocument> {
  return getDb().collection<ScheduleTemplateDocument>('schedule_templates');
}

export function getScheduleAssignmentCollection(): Collection<ScheduleAssignmentDocument> {
  return getDb().collection<ScheduleAssignmentDocument>('schedule_assignments');
}

export async function createScheduleIndexes(): Promise<void> {
  const templates = getScheduleTemplateCollection();
  const assignments = getScheduleAssignmentCollection();

  await Promise.all([
    templates.createIndexes([
      {
        key: { orgId: 1, name: 1 },
        name: 'orgId_name_unique',
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
      { key: { orgId: 1, isActive: 1 }, name: 'orgId_isActive' },
      { key: { orgId: 1, shiftType: 1 }, name: 'orgId_shiftType' },
      { key: { orgId: 1, deletedAt: 1 }, name: 'orgId_deletedAt' },
    ]),
    assignments.createIndexes([
      // Compound — queries por empleado en rango de fechas. No unique porque
      // pueden coexistir draft + published para el mismo (userId, workDate).
      { key: { orgId: 1, userId: 1, workDate: 1 }, name: 'orgId_userId_workDate' },
      // Queries por rango de fechas a nivel org (vista de calendario).
      { key: { orgId: 1, workDate: 1 }, name: 'orgId_workDate' },
      { key: { orgId: 1, status: 1, workDate: 1 }, name: 'orgId_status_workDate' },
      // Queries por ubicación referenciada — útil para "quién está en X locación hoy".
      {
        key: { orgId: 1, 'periods.startLocationId': 1 },
        name: 'orgId_periods_startLocationId',
      },
      {
        key: { orgId: 1, 'periods.serviceCommitments.locationId': 1 },
        name: 'orgId_commitments_locationId',
      },
      { key: { orgId: 1, deletedAt: 1 }, name: 'orgId_deletedAt' },
    ]),
  ]);

  logger.info('✅  Schedule indexes created');
}
