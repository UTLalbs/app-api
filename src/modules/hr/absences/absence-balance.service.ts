import { ObjectId } from 'mongodb';

import { ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import { getUserCollection } from '../../users/user.model';

import { findCategoryByKey } from './absence-category.repository';
import {
  findBalance,
  findBalances,
  upsertBalance,
} from './absence-balance.repository';
import { calcVacationDaysLFT, yearsOfService } from './absence.helpers';
import { findRequestsForUserInYear } from './absence.repository';
import type {
  CustomBalance,
  UserAbsenceBalance,
  VacationBalance,
} from './absence.types';

interface EmployeeForBalance {
  dateOfHire: Date | null;
}

async function loadEmployeeOrThrow(
  orgId: string,
  userId: string,
): Promise<EmployeeForBalance> {
  if (!ObjectId.isValid(userId)) throw new NotFoundError('Empleado');

  const doc = await getUserCollection().findOne(
    {
      _id: new ObjectId(userId),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { projection: { 'employeeProfile.dateOfHire': 1 } },
  );

  if (!doc) throw new NotFoundError('Empleado');

  return {
    dateOfHire: doc.employeeProfile?.dateOfHire ?? null,
  };
}

// Calcula y persiste el saldo de vacaciones del año dado.
//
//   daysEarned    → según LFT 2023 por antigüedad acumulada al año.
//   daysTaken     → ausencias aprobadas con endDate < hoy.
//   daysPending   → ausencias aprobadas futuras + pending del año.
//   daysAvailable → max(0, earned - taken - pending).
export async function recalculateBalance(
  orgId: string,
  userId: string,
  year: number,
): Promise<UserAbsenceBalance> {
  const employee = await loadEmployeeOrThrow(orgId, userId);
  if (!employee.dateOfHire) {
    throw new ConflictError(
      'Empleado sin fecha de ingreso — no se puede calcular saldo',
    );
  }

  const today = new Date();
  const referenceDate = new Date(Date.UTC(year, 11, 31));
  const years = yearsOfService(employee.dateOfHire, referenceDate);
  const daysEarned = calcVacationDaysLFT(years);

  // Días tomados (ausencias aprobadas con endDate < hoy en el año).
  const allRequests = await findRequestsForUserInYear(
    orgId,
    userId,
    year,
    'vacation',
    ['approved', 'pending'],
  );

  let daysTaken = 0;
  let daysPending = 0;

  for (const r of allRequests) {
    if (r.status === 'approved' && r.endDate < today) {
      daysTaken += r.daysConsumeFromBalance;
    } else {
      daysPending += r.daysConsumeFromBalance;
    }
  }

  const vacation: VacationBalance = {
    daysEarned,
    daysTaken,
    daysPending,
    daysAvailable: Math.max(0, daysEarned - daysTaken - daysPending),
    earnedAt: new Date(
      Date.UTC(
        year,
        employee.dateOfHire.getUTCMonth(),
        employee.dateOfHire.getUTCDate(),
      ),
    ),
    nextAccrualAt: new Date(
      Date.UTC(
        year + 1,
        employee.dateOfHire.getUTCMonth(),
        employee.dateOfHire.getUTCDate(),
      ),
    ),
  };

  const customBalances: CustomBalance[] = [];

  return upsertBalance(orgId, userId, year, {
    vacation,
    customBalances,
    lastCalculatedAt: new Date(),
  });
}

export async function getBalance(
  orgId: string,
  userId: string,
  year: number,
): Promise<UserAbsenceBalance> {
  const existing = await findBalance(orgId, userId, year);
  if (existing) return existing;
  return recalculateBalance(orgId, userId, year);
}

export async function listBalances(
  orgId: string,
  year: number,
): Promise<UserAbsenceBalance[]> {
  return findBalances(orgId, year);
}

// Versión liviana usada en createAbsenceRequest para validar saldo sin
// disparar un recálculo si la categoría no consume balance.
export async function getRemainingDays(
  orgId: string,
  userId: string,
  year: number,
  categoryKey: string,
): Promise<number | null> {
  const category = await findCategoryByKey(orgId, categoryKey);
  if (!category || !category.consumesBalance) return null;
  if (categoryKey !== 'vacation') {
    // Otros tipos con balance custom aún no implementados.
    return null;
  }
  const balance = await getBalance(orgId, userId, year);
  return balance.vacation.daysAvailable;
}
