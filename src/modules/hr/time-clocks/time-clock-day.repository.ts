import { ObjectId, type Filter } from 'mongodb';

import { getTimeClockDayCollection } from './time-clock.model';
import type {
  ListDaysFilter,
  TimeClockAnomaly,
  TimeClockAnomalyDocument,
  TimeClockDay,
  TimeClockDayDocument,
} from './time-clock.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toAnomaly(doc: TimeClockAnomalyDocument): TimeClockAnomaly {
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    severity: doc.severity,
    description: doc.description,
    affectsRole: doc.affectsRole,
    affectedEventId: doc.affectedEventId ? doc.affectedEventId.toHexString() : null,
    affectedLocationId: doc.affectedLocationId
      ? doc.affectedLocationId.toHexString()
      : null,
    detectedAt: doc.detectedAt,
    resolvedAt: doc.resolvedAt,
    resolvedBy: doc.resolvedBy ? doc.resolvedBy.toHexString() : null,
    resolutionType: doc.resolutionType,
    resolutionNotes: doc.resolutionNotes,
  };
}

export function toTimeClockDay(doc: TimeClockDayDocument): TimeClockDay {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    userId: doc.userId.toHexString(),
    workDate: doc.workDate.toISOString().slice(0, 10),
    scheduleId: doc.scheduleId ? doc.scheduleId.toHexString() : null,
    status: doc.status,
    events: doc.events.map((id) => id.toHexString()),
    shift: doc.shift,
    serviceVisits: doc.serviceVisits.map((v) => ({
      commitmentId: v.commitmentId ? v.commitmentId.toHexString() : null,
      locationId: v.locationId.toHexString(),
      locationName: v.locationName,
      expectedStart: v.expectedStart,
      expectedEnd: v.expectedEnd,
      actualArrival: v.actualArrival,
      actualDeparture: v.actualDeparture,
      durationMinutes: v.durationMinutes,
      arrivedOnTime: v.arrivedOnTime,
      departedOnTime: v.departedOnTime,
      delayMinutes: v.delayMinutes,
      serviceCompleted: v.serviceCompleted,
    })),
    totalServiceMinutes: doc.totalServiceMinutes,
    anomalies: doc.anomalies.map(toAnomaly),
    reviewStatus: doc.reviewStatus,
    pendingItemsCount: doc.pendingItemsCount,
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    denormalizedRefs: doc.denormalizedRefs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findDays(
  orgId: string,
  filter: ListDaysFilter,
  scopeFilter: Filter<Record<string, unknown>>,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ items: TimeClockDayDocument[]; total: number }> {
  const query: Filter<TimeClockDayDocument> = {
    orgId: new ObjectId(orgId),
    workDate: { $gte: rangeStart, $lte: rangeEnd },
    ...(scopeFilter as Filter<TimeClockDayDocument>),
  };

  if (filter.userId && ObjectId.isValid(filter.userId)) {
    query.userId = new ObjectId(filter.userId);
  }

  // Mapeo de tabs → query.
  switch (filter.tab) {
    case 'missing_clockin':
      query.status = 'scheduled_no_clockin';
      break;
    case 'in_progress':
      query.status = 'in_progress';
      break;
    case 'closed':
      query.status = 'completed';
      break;
    case 'absences':
      query.status = 'absence';
      break;
    case 'late_arrivals':
      query['shift.isLate'] = true;
      break;
    case 'anomalies':
      query.pendingItemsCount = { $gt: 0 };
      break;
    case 'all':
    default:
      // sin filtro extra
      break;
  }

  if (filter.search) {
    query['denormalizedRefs.userName'] = {
      $regex: filter.search,
      $options: 'i',
    };
  }

  const collection = getTimeClockDayCollection();
  const total = await collection.countDocuments(query);
  const items = (await collection
    .find(query)
    .sort({ workDate: -1, 'denormalizedRefs.userName': 1 })
    .skip(filter.page * filter.pageSize)
    .limit(filter.pageSize)
    .toArray()) as TimeClockDayDocument[];

  return { items, total };
}

export async function findDayById(
  id: string,
  orgId: string,
): Promise<TimeClockDayDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getTimeClockDayCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
  });
  return doc as TimeClockDayDocument | null;
}

export async function findDayByUserAndDate(
  orgId: string,
  userId: string,
  workDate: Date,
): Promise<TimeClockDayDocument | null> {
  if (!ObjectId.isValid(userId)) return null;
  const doc = await getTimeClockDayCollection().findOne({
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    workDate,
  });
  return doc as TimeClockDayDocument | null;
}

// Days en un rango (cierre de sesión, cálculo OT semanal, etc.).
export async function findDaysInRange(
  orgId: string,
  start: Date,
  end: Date,
  extra: Partial<Filter<TimeClockDayDocument>> = {},
): Promise<TimeClockDayDocument[]> {
  return getTimeClockDayCollection()
    .find({
      orgId: new ObjectId(orgId),
      workDate: { $gte: start, $lte: end },
      ...extra,
    })
    .toArray() as Promise<TimeClockDayDocument[]>;
}

export async function findDaysByUserInRange(
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
): Promise<TimeClockDayDocument[]> {
  if (!ObjectId.isValid(userId)) return [];
  return getTimeClockDayCollection()
    .find({
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      workDate: { $gte: start, $lte: end },
    })
    .sort({ workDate: 1 })
    .toArray() as Promise<TimeClockDayDocument[]>;
}

// Conteos por status — usado por /pending-by-tab para evitar 6 queries.
export async function countDaysByStatus(
  orgId: string,
  start: Date,
  end: Date,
  scopeFilter: Filter<Record<string, unknown>>,
): Promise<{
  missing_clockin: number;
  late_arrivals: number;
  anomalies: number;
  in_progress: number;
  closed: number;
  absences: number;
}> {
  const baseMatch = {
    orgId: new ObjectId(orgId),
    workDate: { $gte: start, $lte: end },
    ...(scopeFilter as Filter<TimeClockDayDocument>),
  };

  const collection = getTimeClockDayCollection();
  const [results] = await collection
    .aggregate<{
      missing_clockin: number;
      late_arrivals: number;
      anomalies: number;
      in_progress: number;
      closed: number;
      absences: number;
    }>([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          missing_clockin: {
            $sum: { $cond: [{ $eq: ['$status', 'scheduled_no_clockin'] }, 1, 0] },
          },
          late_arrivals: {
            $sum: { $cond: [{ $eq: ['$shift.isLate', true] }, 1, 0] },
          },
          anomalies: {
            $sum: { $cond: [{ $gt: ['$pendingItemsCount', 0] }, 1, 0] },
          },
          in_progress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
          },
          closed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          absences: {
            $sum: { $cond: [{ $eq: ['$status', 'absence'] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();

  return (
    results ?? {
      missing_clockin: 0,
      late_arrivals: 0,
      anomalies: 0,
      in_progress: 0,
      closed: 0,
      absences: 0,
    }
  );
}

// ── Mutations ──────────────────────────────────────────────────────────────

// Upsert por (orgId, userId, workDate) — útil para recalcular el día.
export async function upsertDay(
  doc: TimeClockDayDocument,
): Promise<TimeClockDayDocument> {
  const collection = getTimeClockDayCollection();
  const result = await collection.findOneAndUpdate(
    {
      orgId: doc.orgId,
      userId: doc.userId,
      workDate: doc.workDate,
    },
    {
      $set: {
        scheduleId: doc.scheduleId,
        status: doc.status,
        events: doc.events,
        shift: doc.shift,
        serviceVisits: doc.serviceVisits,
        totalServiceMinutes: doc.totalServiceMinutes,
        anomalies: doc.anomalies,
        reviewStatus: doc.reviewStatus,
        pendingItemsCount: doc.pendingItemsCount,
        llmSummary: doc.llmSummary,
        denormalizedRefs: doc.denormalizedRefs,
        updatedAt: doc.updatedAt,
      },
      $setOnInsert: {
        orgId: doc.orgId,
        userId: doc.userId,
        workDate: doc.workDate,
        humanReadableId: doc.humanReadableId,
        createdAt: doc.createdAt,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return result as TimeClockDayDocument;
}

export async function updateDay(
  id: string,
  orgId: string,
  set: Partial<TimeClockDayDocument>,
): Promise<TimeClockDayDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const result = await getTimeClockDayCollection().findOneAndUpdate(
    { _id: new ObjectId(id), orgId: new ObjectId(orgId) },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return result as TimeClockDayDocument | null;
}
