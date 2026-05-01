import { ObjectId, type Filter } from 'mongodb';

import { getClockReviewSessionCollection } from './time-clock.model';
import type {
  ClockReviewSession,
  ClockReviewSessionDocument,
  ListSessionsFilter,
} from './time-clock.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

export function toClockReviewSession(
  doc: ClockReviewSessionDocument,
): ClockReviewSession {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    shiftDate: doc.shiftDate.toISOString().slice(0, 10),
    shiftPeriod: doc.shiftPeriod,
    reviewedBy: doc.reviewedBy.toHexString(),
    startedAt: doc.startedAt,
    closedAt: doc.closedAt,
    totalEmployees: doc.totalEmployees,
    totalEventsReviewed: doc.totalEventsReviewed,
    totalPendingResolved: doc.totalPendingResolved,
    totalAnomaliesResolved: doc.totalAnomaliesResolved,
    resolutionsByType: doc.resolutionsByType,
    notes: doc.notes,
    isLateReview: doc.isLateReview,
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    createdAt: doc.createdAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findSessionById(
  id: string,
  orgId: string,
): Promise<ClockReviewSessionDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getClockReviewSessionCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
  });
  return doc as ClockReviewSessionDocument | null;
}

export async function findSessions(
  orgId: string,
  filter: ListSessionsFilter,
): Promise<{ items: ClockReviewSessionDocument[]; total: number }> {
  const query: Filter<ClockReviewSessionDocument> = {
    orgId: new ObjectId(orgId),
  };
  if (filter.shiftDateFrom || filter.shiftDateTo) {
    const range: Record<string, Date> = {};
    if (filter.shiftDateFrom) range.$gte = filter.shiftDateFrom;
    if (filter.shiftDateTo) range.$lte = filter.shiftDateTo;
    query.shiftDate = range;
  }
  if (filter.reviewedBy && ObjectId.isValid(filter.reviewedBy)) {
    query.reviewedBy = new ObjectId(filter.reviewedBy);
  }

  const collection = getClockReviewSessionCollection();
  const total = await collection.countDocuments(query);
  const items = (await collection
    .find(query)
    .sort({ closedAt: -1 })
    .skip(filter.page * filter.pageSize)
    .limit(filter.pageSize)
    .toArray()) as ClockReviewSessionDocument[];
  return { items, total };
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function insertSession(
  doc: ClockReviewSessionDocument,
): Promise<ClockReviewSessionDocument> {
  await getClockReviewSessionCollection().insertOne(doc);
  return doc;
}
