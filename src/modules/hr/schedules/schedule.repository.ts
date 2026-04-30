import { ObjectId, type Filter } from 'mongodb';

import {
  getScheduleAssignmentCollection,
  getScheduleTemplateCollection,
} from './schedule.model';
import type {
  AssignmentStatus,
  CreateAssignmentDto,
  CreateTemplateDto,
  ListAssignmentsFilter,
  ListTemplatesFilter,
  Schedule,
  ScheduleAssignmentDocument,
  ScheduleTemplate,
  ScheduleTemplateDocument,
  ServiceCommitment,
  ServiceCommitmentDocument,
  TemplateCommitment,
  TemplateCommitmentDocument,
  UpdateAssignmentDto,
  UpdateTemplateDto,
  WorkPeriod,
  WorkPeriodDocument,
} from './schedule.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toTemplateCommitment(
  doc: TemplateCommitmentDocument,
): TemplateCommitment {
  return {
    locationId: doc.locationId.toHexString(),
    startTime: doc.startTime,
    endTime: doc.endTime,
    serviceType: doc.serviceType,
    isMandatory: doc.isMandatory,
    arrivalTolerance: doc.arrivalTolerance,
  };
}

function toServiceCommitment(
  doc: ServiceCommitmentDocument,
  locationName: string | null = null,
): ServiceCommitment {
  return {
    id: doc._id.toHexString(),
    locationId: doc.locationId.toHexString(),
    locationName,
    startTime: doc.startTime,
    endTime: doc.endTime,
    serviceType: doc.serviceType,
    clientReference: doc.clientReference,
    isMandatory: doc.isMandatory,
    arrivalTolerance: doc.arrivalTolerance,
    notes: doc.notes,
  };
}

function toWorkPeriod(
  doc: WorkPeriodDocument,
  locationNames: Map<string, string>,
): WorkPeriod {
  return {
    id: doc._id.toHexString(),
    shiftType: doc.shiftType,
    startTime: doc.startTime,
    endTime: doc.endTime,
    multiDay: doc.multiDay,
    endDayOffset: doc.endDayOffset,
    expectedDurationDays: doc.expectedDurationDays,
    startLocationId: doc.startLocationId.toHexString(),
    startLocationName: locationNames.get(doc.startLocationId.toHexString()) ?? null,
    endLocationId: doc.endLocationId.toHexString(),
    endLocationName: locationNames.get(doc.endLocationId.toHexString()) ?? null,
    serviceCommitments: doc.serviceCommitments.map((sc) =>
      toServiceCommitment(sc, locationNames.get(sc.locationId.toHexString()) ?? null),
    ),
    applyAutoBreak: doc.applyAutoBreak,
    breakDurationMinutes: doc.breakDurationMinutes,
    coveringForUserId: doc.coveringForUserId
      ? doc.coveringForUserId.toHexString()
      : null,
    coverageReason: doc.coverageReason,
    notes: doc.notes,
  };
}

export function toSchedule(
  doc: ScheduleAssignmentDocument,
  locationNames: Map<string, string> = new Map(),
): Schedule {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    userId: doc.userId.toHexString(),
    workDate: doc.workDate.toISOString().slice(0, 10),
    fromTemplateId: doc.fromTemplateId
      ? doc.fromTemplateId.toHexString()
      : null,
    periods: doc.periods.map((p) => toWorkPeriod(p, locationNames)),
    status: doc.status,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    publishedBy: doc.publishedBy ? doc.publishedBy.toHexString() : null,
    isCoverageOf: doc.isCoverageOf ? doc.isCoverageOf.toHexString() : null,
    isCoveredBy: doc.isCoveredBy ? doc.isCoveredBy.toHexString() : null,
    notes: doc.notes,
    // Calculados se rellenan en service.
    totalMinutes: 0,
    serviceMinutes: 0,
    conflicts: [],
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    denormalizedRefs: doc.denormalizedRefs,
    createdBy: doc.createdBy.toHexString(),
    updatedBy: doc.updatedBy ? doc.updatedBy.toHexString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toScheduleTemplate(
  doc: ScheduleTemplateDocument,
): ScheduleTemplate {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    name: doc.name,
    description: doc.description,
    shiftType: doc.shiftType,
    defaultStartTime: doc.defaultStartTime,
    defaultEndTime: doc.defaultEndTime,
    defaultStartLocationId: doc.defaultStartLocationId
      ? doc.defaultStartLocationId.toHexString()
      : null,
    defaultEndLocationId: doc.defaultEndLocationId
      ? doc.defaultEndLocationId.toHexString()
      : null,
    defaultServiceCommitments: doc.defaultServiceCommitments.map(toTemplateCommitment),
    applyAutoBreak: doc.applyAutoBreak,
    breakDurationMinutes: doc.breakDurationMinutes,
    isActive: doc.isActive,
    isSystem: doc.isSystem,
    colorHex: doc.colorHex,
    llmSummary: doc.llmSummary,
    humanReadableId: doc.humanReadableId,
    createdBy: doc.createdBy.toHexString(),
    updatedBy: doc.updatedBy ? doc.updatedBy.toHexString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Templates: queries ─────────────────────────────────────────────────────

export async function findTemplates(
  orgId: string,
  filter: ListTemplatesFilter,
): Promise<ScheduleTemplate[]> {
  const query: Record<string, unknown> = {
    orgId: new ObjectId(orgId),
    deletedAt: null,
  };

  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.shiftType) query.shiftType = filter.shiftType;

  const docs = await getScheduleTemplateCollection()
    .find(query)
    .sort({ name: 1 })
    .toArray();

  return docs.map((doc) => toScheduleTemplate(doc as ScheduleTemplateDocument));
}

export async function findTemplateById(
  id: string,
  orgId: string,
): Promise<ScheduleTemplate | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getScheduleTemplateCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
    deletedAt: null,
  });

  return doc ? toScheduleTemplate(doc as ScheduleTemplateDocument) : null;
}

export interface CreateTemplateInternal extends CreateTemplateDto {
  orgId: string;
  createdBy: string;
}

export async function createTemplate(
  dto: CreateTemplateInternal,
): Promise<ScheduleTemplate> {
  const now = new Date();

  const doc: Omit<ScheduleTemplateDocument, '_id'> = {
    orgId: new ObjectId(dto.orgId),
    name: dto.name,
    description: dto.description,
    shiftType: dto.shiftType,
    defaultStartTime: dto.defaultStartTime,
    defaultEndTime: dto.defaultEndTime,
    defaultStartLocationId: dto.defaultStartLocationId
      ? new ObjectId(dto.defaultStartLocationId)
      : null,
    defaultEndLocationId: dto.defaultEndLocationId
      ? new ObjectId(dto.defaultEndLocationId)
      : null,
    defaultServiceCommitments: dto.defaultServiceCommitments.map((sc) => ({
      locationId: new ObjectId(sc.locationId),
      startTime: sc.startTime,
      endTime: sc.endTime,
      serviceType: sc.serviceType,
      isMandatory: sc.isMandatory,
      arrivalTolerance: sc.arrivalTolerance,
    })),
    applyAutoBreak: dto.applyAutoBreak,
    breakDurationMinutes: dto.breakDurationMinutes,
    isActive: true,
    isSystem: false,
    colorHex: dto.colorHex,
    llmSummary: null,
    humanReadableId: null,
    createdBy: new ObjectId(dto.createdBy),
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const result = await getScheduleTemplateCollection().insertOne(
    doc as ScheduleTemplateDocument,
  );

  return toScheduleTemplate({
    _id: result.insertedId,
    ...doc,
  } as ScheduleTemplateDocument);
}

export interface UpdateTemplateInternal extends UpdateTemplateDto {
  updatedBy: string;
}

export async function updateTemplate(
  id: string,
  orgId: string,
  dto: UpdateTemplateInternal,
): Promise<ScheduleTemplate | null> {
  if (!ObjectId.isValid(id)) return null;

  const setFields: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: new ObjectId(dto.updatedBy),
  };

  if (dto.name !== undefined) setFields.name = dto.name;
  if (dto.description !== undefined) setFields.description = dto.description;
  if (dto.shiftType !== undefined) setFields.shiftType = dto.shiftType;
  if (dto.defaultStartTime !== undefined)
    setFields.defaultStartTime = dto.defaultStartTime;
  if (dto.defaultEndTime !== undefined)
    setFields.defaultEndTime = dto.defaultEndTime;
  if (dto.defaultStartLocationId !== undefined) {
    setFields.defaultStartLocationId = dto.defaultStartLocationId
      ? new ObjectId(dto.defaultStartLocationId)
      : null;
  }
  if (dto.defaultEndLocationId !== undefined) {
    setFields.defaultEndLocationId = dto.defaultEndLocationId
      ? new ObjectId(dto.defaultEndLocationId)
      : null;
  }
  if (dto.defaultServiceCommitments !== undefined) {
    setFields.defaultServiceCommitments = dto.defaultServiceCommitments.map(
      (sc) => ({
        locationId: new ObjectId(sc.locationId),
        startTime: sc.startTime,
        endTime: sc.endTime,
        serviceType: sc.serviceType,
        isMandatory: sc.isMandatory,
        arrivalTolerance: sc.arrivalTolerance,
      }),
    );
  }
  if (dto.applyAutoBreak !== undefined)
    setFields.applyAutoBreak = dto.applyAutoBreak;
  if (dto.breakDurationMinutes !== undefined)
    setFields.breakDurationMinutes = dto.breakDurationMinutes;
  if (dto.colorHex !== undefined) setFields.colorHex = dto.colorHex;
  if (dto.isActive !== undefined) setFields.isActive = dto.isActive;

  const result = await getScheduleTemplateCollection().findOneAndUpdate(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result ? toScheduleTemplate(result as ScheduleTemplateDocument) : null;
}

export async function softDeleteTemplate(
  id: string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getScheduleTemplateCollection().updateOne(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    {
      $set: {
        deletedAt: new Date(),
        isActive: false,
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}

// ── Assignments: queries ───────────────────────────────────────────────────

export async function findAssignments(
  orgId: string,
  filter: ListAssignmentsFilter,
  scopeFilter: Filter<Record<string, unknown>>,
): Promise<ScheduleAssignmentDocument[]> {
  const query: Filter<ScheduleAssignmentDocument> = {
    orgId: new ObjectId(orgId),
    deletedAt: null,
    workDate: {
      $gte: filter.startDate,
      $lte: filter.endDate,
    },
    ...(scopeFilter as Filter<ScheduleAssignmentDocument>),
  };

  if (filter.userId && ObjectId.isValid(filter.userId)) {
    query.userId = new ObjectId(filter.userId);
  }
  if (filter.status && filter.status !== 'all') {
    query.status = filter.status;
  }
  if (filter.locationId && ObjectId.isValid(filter.locationId)) {
    const locId = new ObjectId(filter.locationId);
    Object.assign(query, {
      $or: [
        { 'periods.startLocationId': locId },
        { 'periods.endLocationId': locId },
        { 'periods.serviceCommitments.locationId': locId },
      ],
    });
  }

  return getScheduleAssignmentCollection()
    .find(query)
    .sort({ workDate: 1, 'denormalizedRefs.userName': 1 })
    .toArray() as Promise<ScheduleAssignmentDocument[]>;
}

export async function findAssignmentById(
  id: string,
  orgId: string,
): Promise<ScheduleAssignmentDocument | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getScheduleAssignmentCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
    deletedAt: null,
  });

  return doc as ScheduleAssignmentDocument | null;
}

export async function findAssignmentsByUserAndDate(
  orgId: string,
  userId: string,
  workDate: Date,
  excludeId: string | null = null,
): Promise<ScheduleAssignmentDocument[]> {
  const query: Filter<ScheduleAssignmentDocument> = {
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    workDate,
    deletedAt: null,
  };
  if (excludeId && ObjectId.isValid(excludeId)) {
    query._id = { $ne: new ObjectId(excludeId) };
  }

  return getScheduleAssignmentCollection()
    .find(query)
    .toArray() as Promise<ScheduleAssignmentDocument[]>;
}

export async function findAssignmentsByUserInRange(
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
  excludeId: string | null = null,
): Promise<ScheduleAssignmentDocument[]> {
  const query: Filter<ScheduleAssignmentDocument> = {
    orgId: new ObjectId(orgId),
    userId: new ObjectId(userId),
    workDate: { $gte: start, $lte: end },
    deletedAt: null,
  };
  if (excludeId && ObjectId.isValid(excludeId)) {
    query._id = { $ne: new ObjectId(excludeId) };
  }

  return getScheduleAssignmentCollection()
    .find(query)
    .sort({ workDate: 1 })
    .toArray() as Promise<ScheduleAssignmentDocument[]>;
}

export interface CreateAssignmentInternal extends CreateAssignmentDto {
  orgId: string;
  createdBy: string;
  userName: string | null;
  userPosition: string | null;
  createdByName: string;
}

export async function createAssignment(
  dto: CreateAssignmentInternal,
): Promise<ScheduleAssignmentDocument> {
  const now = new Date();

  const doc: Omit<ScheduleAssignmentDocument, '_id'> = {
    orgId: new ObjectId(dto.orgId),
    userId: new ObjectId(dto.userId),
    workDate: dto.workDate,
    fromTemplateId: dto.fromTemplateId
      ? new ObjectId(dto.fromTemplateId)
      : null,
    periods: dto.periods.map((p) => ({
      _id: new ObjectId(),
      shiftType: p.shiftType,
      startTime: p.startTime,
      endTime: p.endTime,
      multiDay: p.multiDay,
      endDayOffset: p.endDayOffset,
      expectedDurationDays: p.expectedDurationDays,
      startLocationId: new ObjectId(p.startLocationId),
      endLocationId: new ObjectId(p.endLocationId),
      serviceCommitments: p.serviceCommitments.map((sc) => ({
        _id: new ObjectId(),
        locationId: new ObjectId(sc.locationId),
        startTime: sc.startTime,
        endTime: sc.endTime,
        serviceType: sc.serviceType,
        clientReference: sc.clientReference,
        isMandatory: sc.isMandatory,
        arrivalTolerance: sc.arrivalTolerance,
        notes: sc.notes,
      })),
      applyAutoBreak: p.applyAutoBreak,
      breakDurationMinutes: p.breakDurationMinutes,
      coveringForUserId: p.coveringForUserId
        ? new ObjectId(p.coveringForUserId)
        : null,
      coverageReason: p.coverageReason,
      notes: p.notes,
    })),
    status: 'draft',
    publishedAt: null,
    publishedBy: null,
    isCoverageOf: null,
    isCoveredBy: null,
    notes: dto.notes,
    llmSummary: null,
    humanReadableId: null,
    denormalizedRefs: {
      userName: dto.userName,
      userPosition: dto.userPosition,
      createdByName: dto.createdByName,
      updatedByName: null,
    },
    createdBy: new ObjectId(dto.createdBy),
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const result = await getScheduleAssignmentCollection().insertOne(
    doc as ScheduleAssignmentDocument,
  );

  return { _id: result.insertedId, ...doc } as ScheduleAssignmentDocument;
}

export interface UpdateAssignmentInternal extends UpdateAssignmentDto {
  updatedBy: string;
  updatedByName: string;
  status?: AssignmentStatus;
  publishedAt?: Date | null;
  publishedBy?: string | null;
}

export async function updateAssignment(
  id: string,
  orgId: string,
  dto: UpdateAssignmentInternal,
): Promise<ScheduleAssignmentDocument | null> {
  if (!ObjectId.isValid(id)) return null;

  const setFields: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: new ObjectId(dto.updatedBy),
    'denormalizedRefs.updatedByName': dto.updatedByName,
  };

  if (dto.workDate !== undefined) setFields.workDate = dto.workDate;
  if (dto.notes !== undefined) setFields.notes = dto.notes;
  if (dto.status !== undefined) setFields.status = dto.status;
  if (dto.publishedAt !== undefined) setFields.publishedAt = dto.publishedAt;
  if (dto.publishedBy !== undefined) {
    setFields.publishedBy = dto.publishedBy
      ? new ObjectId(dto.publishedBy)
      : null;
  }

  if (dto.periods !== undefined) {
    setFields.periods = dto.periods.map((p) => ({
      _id: new ObjectId(),
      shiftType: p.shiftType,
      startTime: p.startTime,
      endTime: p.endTime,
      multiDay: p.multiDay,
      endDayOffset: p.endDayOffset,
      expectedDurationDays: p.expectedDurationDays,
      startLocationId: new ObjectId(p.startLocationId),
      endLocationId: new ObjectId(p.endLocationId),
      serviceCommitments: p.serviceCommitments.map((sc) => ({
        _id: new ObjectId(),
        locationId: new ObjectId(sc.locationId),
        startTime: sc.startTime,
        endTime: sc.endTime,
        serviceType: sc.serviceType,
        clientReference: sc.clientReference,
        isMandatory: sc.isMandatory,
        arrivalTolerance: sc.arrivalTolerance,
        notes: sc.notes,
      })),
      applyAutoBreak: p.applyAutoBreak,
      breakDurationMinutes: p.breakDurationMinutes,
      coveringForUserId: p.coveringForUserId
        ? new ObjectId(p.coveringForUserId)
        : null,
      coverageReason: p.coverageReason,
      notes: p.notes,
    }));
  }

  const result = await getScheduleAssignmentCollection().findOneAndUpdate(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result as ScheduleAssignmentDocument | null;
}

export async function softDeleteAssignment(
  id: string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getScheduleAssignmentCollection().updateOne(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    {
      $set: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}

// Inverso de softDeleteAssignment. Limpia deletedAt para que el schedule
// vuelva a aparecer en queries normales. Idempotente: si ya está activo no
// hace nada.
export async function restoreAssignment(
  id: string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getScheduleAssignmentCollection().updateOne(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: { $ne: null },
    },
    {
      $set: {
        deletedAt: null,
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}
