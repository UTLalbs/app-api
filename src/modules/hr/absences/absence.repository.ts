import { ObjectId, type Filter } from 'mongodb';

import { getAbsenceRequestCollection } from './absence.model';
import type {
  AbsenceAttachment,
  AbsenceAttachmentDocument,
  AbsenceConflict,
  AbsenceConflictDocument,
  AbsenceRequest,
  AbsenceRequestDocument,
  AbsenceStatus,
  CoverageAssignment,
  CoverageAssignmentDocument,
  ListAbsenceRequestsFilter,
} from './absence.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toAttachment(doc: AbsenceAttachmentDocument): AbsenceAttachment {
  return {
    id: doc._id.toHexString(),
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    s3Key: doc.s3Key,
    uploadedBy: doc.uploadedBy.toHexString(),
    uploadedAt: doc.uploadedAt,
    description: doc.description,
  };
}

function toConflict(doc: AbsenceConflictDocument): AbsenceConflict {
  return {
    type: doc.type,
    severity: doc.severity,
    description: doc.description,
    details: doc.details,
  };
}

function toCoverageAssignment(
  doc: CoverageAssignmentDocument,
): CoverageAssignment {
  return {
    scheduleId: doc.scheduleId.toHexString(),
    workDate: doc.workDate.toISOString().slice(0, 10),
    status: doc.status,
    coveringUserId: doc.coveringUserId
      ? doc.coveringUserId.toHexString()
      : null,
    resolvedAt: doc.resolvedAt,
  };
}

export function toAbsenceRequest(
  doc: AbsenceRequestDocument,
): AbsenceRequest {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    userId: doc.userId.toHexString(),
    categoryKey: doc.categoryKey,
    startDate: doc.startDate.toISOString().slice(0, 10),
    endDate: doc.endDate.toISOString().slice(0, 10),
    totalDaysNatural: doc.totalDaysNatural,
    totalDaysWorking: doc.totalDaysWorking,
    daysConsumeFromBalance: doc.daysConsumeFromBalance,
    isPartialDay: doc.isPartialDay,
    partialDayHours: doc.partialDayHours,
    status: doc.status,
    requestedBy: doc.requestedBy.toHexString(),
    requestedByRole: doc.requestedByRole,
    requestedAt: doc.requestedAt,
    reviewedBy: doc.reviewedBy ? doc.reviewedBy.toHexString() : null,
    reviewedAt: doc.reviewedAt,
    reviewerNotes: doc.reviewerNotes,
    requiresHrApproval: doc.requiresHrApproval,
    hrReviewedBy: doc.hrReviewedBy ? doc.hrReviewedBy.toHexString() : null,
    hrReviewedAt: doc.hrReviewedAt,
    hrReviewerNotes: doc.hrReviewerNotes,
    rejectionReason: doc.rejectionReason,
    rejectionCategory: doc.rejectionCategory ?? null,
    cancelledBy: doc.cancelledBy ? doc.cancelledBy.toHexString() : null,
    cancelledAt: doc.cancelledAt,
    cancellationReason: doc.cancellationReason,
    cancellationCategory: doc.cancellationCategory ?? null,
    reason: doc.reason,
    attachments: doc.attachments.map(toAttachment),
    imssReference: doc.imssReference,
    certificateExpiresAt: doc.certificateExpiresAt,
    conflicts: doc.conflicts.map(toConflict),
    coverageAssignments: doc.coverageAssignments.map(toCoverageAssignment),
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    denormalizedRefs: doc.denormalizedRefs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findRequests(
  orgId: string,
  filter: ListAbsenceRequestsFilter,
  scopeFilter: Filter<Record<string, unknown>>,
): Promise<{ items: AbsenceRequestDocument[]; total: number }> {
  const query: Filter<AbsenceRequestDocument> = {
    orgId: new ObjectId(orgId),
    deletedAt: null,
    ...(scopeFilter as Filter<AbsenceRequestDocument>),
  };

  if (filter.userId && ObjectId.isValid(filter.userId)) {
    query.userId = new ObjectId(filter.userId);
  }
  if (filter.status && filter.status !== 'all') {
    query.status = filter.status;
  }
  if (filter.categoryKey) {
    query.categoryKey = filter.categoryKey;
  }
  if (filter.startDateFrom || filter.startDateTo) {
    const range: Record<string, Date> = {};
    if (filter.startDateFrom) range.$gte = filter.startDateFrom;
    if (filter.startDateTo) range.$lte = filter.startDateTo;
    query.startDate = range;
  }
  if (filter.requestedAtFrom || filter.requestedAtTo) {
    const range: Record<string, Date> = {};
    if (filter.requestedAtFrom) range.$gte = filter.requestedAtFrom;
    if (filter.requestedAtTo) range.$lte = filter.requestedAtTo;
    query.requestedAt = range;
  }

  const collection = getAbsenceRequestCollection();
  const total = await collection.countDocuments(query);
  const items = (await collection
    .find(query)
    .sort({ requestedAt: -1 })
    .skip(filter.page * filter.pageSize)
    .limit(filter.pageSize)
    .toArray()) as AbsenceRequestDocument[];

  return { items, total };
}

export async function findRequestById(
  id: string,
  orgId: string,
): Promise<AbsenceRequestDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getAbsenceRequestCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
    deletedAt: null,
  });
  return doc as AbsenceRequestDocument | null;
}

// Para detección de overlaps (entre solicitudes del mismo empleado).
export async function findOverlappingRequests(
  orgId: string,
  userId: string,
  startDate: Date,
  endDate: Date,
  statuses: AbsenceStatus[],
  excludeId: string | null = null,
): Promise<AbsenceRequestDocument[]> {
  if (!ObjectId.isValid(userId)) return [];
  const query: Filter<AbsenceRequestDocument> = {
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    status: { $in: statuses },
    deletedAt: null,
    // Overlap clásico: a.start <= b.end AND b.start <= a.end
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeId && ObjectId.isValid(excludeId)) {
    query._id = { $ne: new ObjectId(excludeId) };
  }
  return getAbsenceRequestCollection()
    .find(query)
    .toArray() as Promise<AbsenceRequestDocument[]>;
}

// "Active on date": ausencias aprobadas vigentes en una fecha específica.
// Usado por schedules + (futuro) time-clocks.
export async function findActiveOnDate(
  orgId: string,
  date: Date,
  userId: string | null = null,
): Promise<AbsenceRequestDocument[]> {
  const query: Filter<AbsenceRequestDocument> = {
    orgId: new ObjectId(orgId),
    status: 'approved',
    deletedAt: null,
    startDate: { $lte: date },
    endDate: { $gte: date },
  };
  if (userId && ObjectId.isValid(userId)) {
    query.userId = new ObjectId(userId);
  }
  return getAbsenceRequestCollection()
    .find(query)
    .toArray() as Promise<AbsenceRequestDocument[]>;
}

// Versión específica para schedules: dado un empleado y una fecha, hay
// alguna ausencia (approved o pending) que cubra ese día?
export async function findOverlappingForSchedule(
  orgId: string,
  userId: string,
  workDate: Date,
): Promise<AbsenceRequestDocument[]> {
  if (!ObjectId.isValid(userId)) return [];
  return getAbsenceRequestCollection()
    .find({
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      status: { $in: ['approved', 'pending'] },
      deletedAt: null,
      startDate: { $lte: workDate },
      endDate: { $gte: workDate },
    })
    .toArray() as Promise<AbsenceRequestDocument[]>;
}

export async function findRequestsForUserInYear(
  orgId: string,
  userId: string,
  year: number,
  categoryKey: string,
  statuses: AbsenceStatus[],
): Promise<AbsenceRequestDocument[]> {
  if (!ObjectId.isValid(userId)) return [];
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  return getAbsenceRequestCollection()
    .find({
      orgId: new ObjectId(orgId),
      userId: new ObjectId(userId),
      categoryKey,
      status: { $in: statuses },
      deletedAt: null,
      startDate: { $lte: yearEnd },
      endDate: { $gte: yearStart },
    })
    .toArray() as Promise<AbsenceRequestDocument[]>;
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function insertRequest(
  doc: AbsenceRequestDocument,
): Promise<AbsenceRequestDocument> {
  await getAbsenceRequestCollection().insertOne(doc);
  return doc;
}

export async function updateRequest(
  id: string,
  orgId: string,
  set: Partial<AbsenceRequestDocument>,
): Promise<AbsenceRequestDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const result = await getAbsenceRequestCollection().findOneAndUpdate(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    {
      $set: {
        ...set,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  return result as AbsenceRequestDocument | null;
}

export async function softDeleteRequest(
  id: string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const result = await getAbsenceRequestCollection().updateOne(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}
