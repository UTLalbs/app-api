import { ObjectId } from 'mongodb';

import { getAbsenceCategoryCollection } from './absence.model';
import type {
  AbsenceCategory,
  AbsenceCategoryDocument,
  CreateAbsenceCategoryDto,
  UpdateAbsenceCategoryDto,
} from './absence.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

export function toAbsenceCategory(
  doc: AbsenceCategoryDocument,
): AbsenceCategory {
  return {
    id: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    key: doc.key,
    name: doc.name,
    description: doc.description,
    isPaid: doc.isPaid,
    consumesBalance: doc.consumesBalance,
    requiresApproval: doc.requiresApproval,
    requiresCertificate: doc.requiresCertificate,
    maxDaysPerRequest: doc.maxDaysPerRequest,
    legalMinimumDays: doc.legalMinimumDays,
    hrApprovalThresholdDays: doc.hrApprovalThresholdDays,
    colorHex: doc.colorHex,
    iconEmoji: doc.iconEmoji,
    isSystem: doc.isSystem,
    isActive: doc.isActive,
    createdBy: doc.createdBy ? doc.createdBy.toHexString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findCategories(
  orgId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<AbsenceCategory[]> {
  const query: Record<string, unknown> = {
    orgId: new ObjectId(orgId),
    deletedAt: null,
  };
  if (!opts.includeInactive) query.isActive = true;

  const docs = await getAbsenceCategoryCollection()
    .find(query)
    .sort({ isSystem: -1, name: 1 })
    .toArray();

  return docs.map((d) => toAbsenceCategory(d as AbsenceCategoryDocument));
}

export async function findCategoryById(
  id: string,
  orgId: string,
): Promise<AbsenceCategory | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await getAbsenceCategoryCollection().findOne({
    _id: new ObjectId(id),
    orgId: new ObjectId(orgId),
    deletedAt: null,
  });
  return doc ? toAbsenceCategory(doc as AbsenceCategoryDocument) : null;
}

export async function findCategoryByKey(
  orgId: string,
  key: string,
): Promise<AbsenceCategory | null> {
  const doc = await getAbsenceCategoryCollection().findOne({
    orgId: new ObjectId(orgId),
    key,
    deletedAt: null,
  });
  return doc ? toAbsenceCategory(doc as AbsenceCategoryDocument) : null;
}

// ── Mutations ──────────────────────────────────────────────────────────────

export interface CreateCategoryInternal extends CreateAbsenceCategoryDto {
  orgId: string;
  key: string;
  isSystem: boolean;
  createdBy: string | null;
}

export async function createCategory(
  dto: CreateCategoryInternal,
): Promise<AbsenceCategory> {
  const now = new Date();
  const doc: Omit<AbsenceCategoryDocument, '_id'> = {
    orgId: new ObjectId(dto.orgId),
    key: dto.key,
    name: dto.name,
    description: dto.description,
    isPaid: dto.isPaid,
    consumesBalance: dto.consumesBalance,
    requiresApproval: dto.requiresApproval,
    requiresCertificate: dto.requiresCertificate,
    maxDaysPerRequest: dto.maxDaysPerRequest,
    legalMinimumDays: dto.legalMinimumDays,
    hrApprovalThresholdDays: dto.hrApprovalThresholdDays,
    colorHex: dto.colorHex,
    iconEmoji: dto.iconEmoji,
    isSystem: dto.isSystem,
    isActive: true,
    createdBy: dto.createdBy ? new ObjectId(dto.createdBy) : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const result = await getAbsenceCategoryCollection().insertOne(
    doc as AbsenceCategoryDocument,
  );
  return toAbsenceCategory({
    _id: result.insertedId,
    ...doc,
  } as AbsenceCategoryDocument);
}

export async function updateCategory(
  id: string,
  orgId: string,
  dto: UpdateAbsenceCategoryDto,
): Promise<AbsenceCategory | null> {
  if (!ObjectId.isValid(id)) return null;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (dto.name !== undefined) setFields.name = dto.name;
  if (dto.description !== undefined) setFields.description = dto.description;
  if (dto.isPaid !== undefined) setFields.isPaid = dto.isPaid;
  if (dto.consumesBalance !== undefined)
    setFields.consumesBalance = dto.consumesBalance;
  if (dto.requiresApproval !== undefined)
    setFields.requiresApproval = dto.requiresApproval;
  if (dto.requiresCertificate !== undefined)
    setFields.requiresCertificate = dto.requiresCertificate;
  if (dto.maxDaysPerRequest !== undefined)
    setFields.maxDaysPerRequest = dto.maxDaysPerRequest;
  if (dto.legalMinimumDays !== undefined)
    setFields.legalMinimumDays = dto.legalMinimumDays;
  if (dto.hrApprovalThresholdDays !== undefined)
    setFields.hrApprovalThresholdDays = dto.hrApprovalThresholdDays;
  if (dto.colorHex !== undefined) setFields.colorHex = dto.colorHex;
  if (dto.iconEmoji !== undefined) setFields.iconEmoji = dto.iconEmoji;
  if (dto.isActive !== undefined) setFields.isActive = dto.isActive;

  const result = await getAbsenceCategoryCollection().findOneAndUpdate(
    {
      _id: new ObjectId(id),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result ? toAbsenceCategory(result as AbsenceCategoryDocument) : null;
}

export async function softDeleteCategory(
  id: string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const result = await getAbsenceCategoryCollection().updateOne(
    { _id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null },
    { $set: { deletedAt: new Date(), isActive: false, updatedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}
