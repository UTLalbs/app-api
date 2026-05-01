import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type {
  ClockReviewSessionDocument,
  TimeClockDayDocument,
  TimeClockEventDocument,
} from './time-clock.types';

export function getTimeClockEventCollection(): Collection<TimeClockEventDocument> {
  return getDb().collection<TimeClockEventDocument>('time_clock_events');
}

export function getTimeClockDayCollection(): Collection<TimeClockDayDocument> {
  return getDb().collection<TimeClockDayDocument>('time_clock_days');
}

export function getClockReviewSessionCollection(): Collection<ClockReviewSessionDocument> {
  return getDb().collection<ClockReviewSessionDocument>('clock_review_sessions');
}

export async function createTimeClockIndexes(): Promise<void> {
  const events = getTimeClockEventCollection();
  const days = getTimeClockDayCollection();
  const sessions = getClockReviewSessionCollection();

  await Promise.all([
    events.createIndexes([
      // Línea de tiempo del empleado.
      { key: { orgId: 1, userId: 1, clockedAt: -1 }, name: 'orgId_userId_clockedAt' },
      // Listado por rango a nivel org.
      { key: { orgId: 1, clockedAt: -1 }, name: 'orgId_clockedAt' },
      // Asociación con schedule (queries reversas).
      { key: { orgId: 1, scheduleId: 1 }, name: 'orgId_scheduleId' },
      // "Último evento del tipo X" — usado por widget / status.
      {
        key: { orgId: 1, userId: 1, type: 1, clockedAt: -1 },
        name: 'orgId_userId_type_clockedAt',
      },
      // Bandeja de revisión por estado.
      { key: { orgId: 1, reviewStatus: 1, clockedAt: -1 }, name: 'orgId_reviewStatus_clockedAt' },
      { key: { orgId: 1, reviewSessionId: 1 }, name: 'orgId_reviewSessionId' },
      { key: { orgId: 1, deletedAt: 1 }, name: 'orgId_deletedAt' },
    ]),
    days.createIndexes([
      // Único por (org, user, date) — el agregado se reescribe vía upsert.
      {
        key: { orgId: 1, userId: 1, workDate: 1 },
        name: 'orgId_userId_workDate_unique',
        unique: true,
      },
      // Listas por turno (revisión).
      { key: { orgId: 1, workDate: 1, status: 1 }, name: 'orgId_workDate_status' },
      // Filtro rápido de "días con pendientes".
      {
        key: { orgId: 1, status: 1, pendingItemsCount: 1 },
        name: 'orgId_status_pendingItemsCount',
      },
    ]),
    sessions.createIndexes([
      { key: { orgId: 1, shiftDate: 1, shiftPeriod: 1 }, name: 'orgId_shiftDate_shiftPeriod' },
      { key: { orgId: 1, reviewedBy: 1, closedAt: -1 }, name: 'orgId_reviewedBy_closedAt' },
    ]),
  ]);

  logger.info('✅  Time-clock indexes created');
}
