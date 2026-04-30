import { ObjectId } from 'mongodb';

import { getUserAbsenceBalanceCollection } from './absence.model';
import type {
  CustomBalance,
  UserAbsenceBalance,
  UserAbsenceBalanceDocument,
  VacationBalance,
} from './absence.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

export function toUserAbsenceBalance(
  doc: UserAbsenceBalanceDocument,
): UserAbsenceBalance {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    userId: doc.userId.toHexString(),
    year: doc.year,
    vacation: doc.vacation,
    customBalances: doc.customBalances,
    lastCalculatedAt: doc.lastCalculatedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findBalance(
  orgId: string,
  userId: string,
  year: number,
): Promise<UserAbsenceBalance | null> {
  if (!ObjectId.isValid(userId)) return null;
  const doc = await getUserAbsenceBalanceCollection().findOne({
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    year,
  });
  return doc
    ? toUserAbsenceBalance(doc as UserAbsenceBalanceDocument)
    : null;
}

export async function findBalances(
  orgId: string,
  year: number,
): Promise<UserAbsenceBalance[]> {
  const docs = await getUserAbsenceBalanceCollection()
    .find({ orgId: new ObjectId(orgId), year })
    .toArray();
  return docs.map((d) =>
    toUserAbsenceBalance(d as UserAbsenceBalanceDocument),
  );
}

// ── Mutations ──────────────────────────────────────────────────────────────

export interface UpsertBalanceInternal {
  vacation: VacationBalance;
  customBalances: CustomBalance[];
  lastCalculatedAt: Date;
}

export async function upsertBalance(
  orgId: string,
  userId: string,
  year: number,
  payload: UpsertBalanceInternal,
): Promise<UserAbsenceBalance> {
  const now = new Date();
  const result = await getUserAbsenceBalanceCollection().findOneAndUpdate(
    {
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      year,
    },
    {
      $set: {
        vacation: payload.vacation,
        customBalances: payload.customBalances,
        lastCalculatedAt: payload.lastCalculatedAt,
        updatedAt: now,
      },
      $setOnInsert: {
        orgId: new ObjectId(orgId),
        userId: new ObjectId(userId),
        year,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return toUserAbsenceBalance(result as UserAbsenceBalanceDocument);
}
