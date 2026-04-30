import type { Collection } from 'mongodb';

import { getDb } from '../../../config/database';
import { logger } from '../../../config/logger';

import type {
  AbsenceCategoryDocument,
  AbsenceRequestDocument,
  UserAbsenceBalanceDocument,
} from './absence.types';

export function getAbsenceCategoryCollection(): Collection<AbsenceCategoryDocument> {
  return getDb().collection<AbsenceCategoryDocument>('absence_categories');
}

export function getAbsenceRequestCollection(): Collection<AbsenceRequestDocument> {
  return getDb().collection<AbsenceRequestDocument>('absence_requests');
}

export function getUserAbsenceBalanceCollection(): Collection<UserAbsenceBalanceDocument> {
  return getDb().collection<UserAbsenceBalanceDocument>('user_absence_balances');
}

export async function createAbsenceIndexes(): Promise<void> {
  const categories = getAbsenceCategoryCollection();
  const requests = getAbsenceRequestCollection();
  const balances = getUserAbsenceBalanceCollection();

  await Promise.all([
    categories.createIndexes([
      {
        key: { orgId: 1, key: 1 },
        name: 'orgId_key_unique',
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
      { key: { orgId: 1, isActive: 1 }, name: 'orgId_isActive' },
      { key: { orgId: 1, isSystem: 1 }, name: 'orgId_isSystem' },
      { key: { orgId: 1, deletedAt: 1 }, name: 'orgId_deletedAt' },
    ]),
    requests.createIndexes([
      // Query principal por empleado en rango de fechas.
      { key: { orgId: 1, userId: 1, startDate: 1 }, name: 'orgId_userId_startDate' },
      // Listas filtradas por status (pending/approved) en histórico.
      { key: { orgId: 1, status: 1, createdAt: -1 }, name: 'orgId_status_createdAt' },
      // "Aprobadas vigentes" en una fecha.
      { key: { orgId: 1, status: 1, startDate: 1 }, name: 'orgId_status_startDate' },
      { key: { orgId: 1, categoryKey: 1 }, name: 'orgId_categoryKey' },
      { key: { orgId: 1, requestedAt: -1 }, name: 'orgId_requestedAt' },
      // Detección de overlaps al crear schedule/absence.
      {
        key: { orgId: 1, userId: 1, status: 1, startDate: 1, endDate: 1 },
        name: 'orgId_user_status_range',
      },
      { key: { orgId: 1, deletedAt: 1 }, name: 'orgId_deletedAt' },
    ]),
    balances.createIndexes([
      {
        key: { orgId: 1, userId: 1, year: 1 },
        name: 'orgId_userId_year_unique',
        unique: true,
      },
    ]),
  ]);

  logger.info('✅  Absence indexes created');
}
