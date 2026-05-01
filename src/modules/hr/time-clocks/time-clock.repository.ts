import { ObjectId, type Filter } from 'mongodb';

import { getTimeClockEventCollection } from './time-clock.model';
import type {
  ClockReviewStatus,
  ListEventsFilter,
  TimeClockEvent,
  TimeClockEventDocument,
  TimeClockEventType,
} from './time-clock.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

export function toTimeClockEvent(
  doc: TimeClockEventDocument,
): TimeClockEvent {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    userId: doc.userId.toHexString(),
    type: doc.type,
    clockedAt: doc.clockedAt,
    clockedAtLocal: doc.clockedAtLocal,
    scheduleId: doc.scheduleId ? doc.scheduleId.toHexString() : null,
    periodId: doc.periodId ? doc.periodId.toHexString() : null,
    serviceCommitmentId: doc.serviceCommitmentId
      ? doc.serviceCommitmentId.toHexString()
      : null,
    reportedLocation: doc.reportedLocation,
    expectedLocationId: doc.expectedLocationId
      ? doc.expectedLocationId.toHexString()
      : null,
    geofenceStatus: doc.geofenceStatus,
    distanceFromExpectedMeters: doc.distanceFromExpectedMeters,
    source: doc.source,
    correctedBy: doc.correctedBy ? doc.correctedBy.toHexString() : null,
    correctionReason: doc.correctionReason,
    correctsEventId: doc.correctsEventId ? doc.correctsEventId.toHexString() : null,
    isExcluded: doc.isExcluded,
    excludedBy: doc.excludedBy ? doc.excludedBy.toHexString() : null,
    excludedAt: doc.excludedAt,
    exclusionReason: doc.exclusionReason,
    device: doc.device,
    reviewStatus: doc.reviewStatus,
    reviewedBy: doc.reviewedBy ? doc.reviewedBy.toHexString() : null,
    reviewedAt: doc.reviewedAt,
    reviewNotes: doc.reviewNotes,
    reviewSessionId: doc.reviewSessionId ? doc.reviewSessionId.toHexString() : null,
    notes: doc.notes,
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    denormalizedRefs: doc.denormalizedRefs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findEvents(
  orgId: string,
  filter: ListEventsFilter,
  scopeFilter: Filter<Record<string, unknown>>,
): Promise<{ items: TimeClockEventDocument[]; total: number }> {
  const query: Filter<TimeClockEventDocument> = {
    orgId: new ObjectId(orgId),
    deletedAt: null,
    clockedAt: { $gte: filter.startDate, $lte: filter.endDate },
    ...(scopeFilter as Filter<TimeClockEventDocument>),
  };
  if (filter.userId && ObjectId.isValid(filter.userId)) {
    query.userId = new ObjectId(filter.userId);
  }
  if (filter.type) {
    query.type = filter.type;
  }
  if (filter.reviewStatus && filter.reviewStatus !== 'all') {
    query.reviewStatus = filter.reviewStatus;
  }

  const collection = getTimeClockEventCollection();
  const total = await collection.countDocuments(query);
  const items = (await collection
    .find(query)
    .sort({ clockedAt: -1 })
    .skip(filter.page * filter.pageSize)
    .limit(filter.pageSize)
    .toArray()) as TimeClockEventDocument[];

  return { items, total };
}

export async function findEventById(
  id: string,
  orgId: string,
): Promise<TimeClockEventDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getTimeClockEventCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
    deletedAt: null,
  });
  return doc as TimeClockEventDocument | null;
}

// Eventos de un usuario en un rango (utilizado para recalcular el día).
export async function findEventsByUserInRange(
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
  opts: { includeExcluded?: boolean } = {},
): Promise<TimeClockEventDocument[]> {
  if (!ObjectId.isValid(userId)) return [];
  const query: Filter<TimeClockEventDocument> = {
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    deletedAt: null,
    clockedAt: { $gte: start, $lte: end },
  };
  if (!opts.includeExcluded) {
    query.isExcluded = false;
  }
  return getTimeClockEventCollection()
    .find(query)
    .sort({ clockedAt: 1 })
    .toArray() as Promise<TimeClockEventDocument[]>;
}

// Último evento del usuario (cualquier tipo) — útil para el widget.
export async function findLastEventForUser(
  orgId: string,
  userId: string,
): Promise<TimeClockEventDocument | null> {
  if (!ObjectId.isValid(userId)) return null;
  const doc = await getTimeClockEventCollection().findOne(
    {
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      isExcluded: false,
      deletedAt: null,
    },
    { sort: { clockedAt: -1 } },
  );
  return doc as TimeClockEventDocument | null;
}

// Último evento de un tipo específico para un usuario.
export async function findLastEventOfType(
  orgId: string,
  userId: string,
  type: TimeClockEventType,
): Promise<TimeClockEventDocument | null> {
  if (!ObjectId.isValid(userId)) return null;
  const doc = await getTimeClockEventCollection().findOne(
    {
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      type,
      isExcluded: false,
      deletedAt: null,
    },
    { sort: { clockedAt: -1 } },
  );
  return doc as TimeClockEventDocument | null;
}

// Empleados actualmente fichados (shift_start sin shift_end posterior).
// Usado por dashboard / vista de presencia en tiempo real.
export async function findActiveEmployees(
  orgId: string,
  scopeFilter: Filter<Record<string, unknown>>,
): Promise<TimeClockEventDocument[]> {
  // Estrategia: cargamos los últimos eventos por usuario y dejamos que el
  // service filtre los que están "abiertos". Limit 500 para no agarrar todo
  // el histórico de orgs grandes.
  const collection = getTimeClockEventCollection();
  return collection
    .aggregate<TimeClockEventDocument>([
      {
        $match: {
          orgId: new ObjectId(orgId),
          deletedAt: null,
          isExcluded: false,
          ...(scopeFilter as Filter<TimeClockEventDocument>),
        },
      },
      { $sort: { clockedAt: -1 } },
      {
        $group: {
          _id: '$userId',
          last: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$last' } },
      { $match: { type: 'shift_start' } },
      { $limit: 500 },
    ])
    .toArray() as Promise<TimeClockEventDocument[]>;
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function insertEvent(
  doc: TimeClockEventDocument,
): Promise<TimeClockEventDocument> {
  await getTimeClockEventCollection().insertOne(doc);
  return doc;
}

export async function updateEvent(
  id: string,
  orgId: string,
  set: Partial<TimeClockEventDocument>,
): Promise<TimeClockEventDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const result = await getTimeClockEventCollection().findOneAndUpdate(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return result as TimeClockEventDocument | null;
}

// Marca eventos del rango con un reviewSessionId al cerrar la sesión.
export async function tagEventsWithSessionId(
  orgId: string,
  start: Date,
  end: Date,
  sessionId: ObjectId,
  reviewStatuses: ClockReviewStatus[],
): Promise<number> {
  const result = await getTimeClockEventCollection().updateMany(
    {
      orgId: new ObjectId(orgId),
      clockedAt: { $gte: start, $lte: end },
      reviewStatus: { $in: reviewStatuses },
      deletedAt: null,
    },
    { $set: { reviewSessionId: sessionId, updatedAt: new Date() } },
  );
  return result.modifiedCount;
}
