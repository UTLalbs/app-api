import { ObjectId } from 'mongodb';

import { getPositionCollection } from './position.model';
import type {
  CreatePositionDto,
  Position,
  PositionDocument,
  PositionQueryFilter,
  PositionSeedItem,
  UpdatePositionDto,
} from './position.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toPosition(doc: PositionDocument): Position {
  return {
    id:        doc._id.toHexString(),
    orgId:     doc.orgId.toHexString(),
    name:      doc.name,
    key:       doc.key,
    isSystem:  doc.isSystem,
    isActive:  doc.isActive,
    createdBy: doc.createdBy.toHexString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Listar ────────────────────────────────────────────────────────────────

export async function findPositions(
  orgId:  string,
  filter: PositionQueryFilter,
): Promise<Position[]> {
  const query: Record<string, unknown> = { orgId: new ObjectId(orgId) };

  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.isSystem !== undefined) query.isSystem = filter.isSystem;

  const docs = await getPositionCollection()
    .find(query)
    .sort({ name: 1 })
    .toArray();

  return docs.map((doc) => toPosition(doc as PositionDocument));
}

// ── Buscar por ID ──────────────────────────────────────────────────────────

export async function findPositionById(
  id:    string,
  orgId: string,
): Promise<Position | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getPositionCollection().findOne({
    _id:   new ObjectId(id),
    orgId: new ObjectId(orgId),
  });

  return doc ? toPosition(doc as PositionDocument) : null;
}

// ── Buscar por key ────────────────────────────────────────────────────────

export async function findPositionByKey(
  orgId: string,
  key:   string,
): Promise<Position | null> {
  const doc = await getPositionCollection().findOne({
    orgId: new ObjectId(orgId),
    key,
  });

  return doc ? toPosition(doc as PositionDocument) : null;
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function createPosition(dto: CreatePositionDto): Promise<Position> {
  const now = new Date();

  const doc: Omit<PositionDocument, '_id'> = {
    orgId:     new ObjectId(dto.orgId),
    name:      dto.name,
    key:       dto.key,
    isSystem:  dto.isSystem,
    isActive:  dto.isActive,
    createdBy: new ObjectId(dto.createdBy),
    createdAt: now,
    updatedAt: now,
  };

  const result = await getPositionCollection().insertOne(doc as PositionDocument);

  return toPosition({ _id: result.insertedId, ...doc } as PositionDocument);
}

// ── Actualizar ────────────────────────────────────────────────────────────

export async function updatePosition(
  id:    string,
  orgId: string,
  dto:   UpdatePositionDto,
): Promise<Position | null> {
  if (!ObjectId.isValid(id)) return null;

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (dto.name     !== undefined) setFields.name     = dto.name;
  if (dto.isActive !== undefined) setFields.isActive = dto.isActive;

  const result = await getPositionCollection().findOneAndUpdate(
    { _id: new ObjectId(id), orgId: new ObjectId(orgId) },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result ? toPosition(result as PositionDocument) : null;
}

// ── Eliminar ──────────────────────────────────────────────────────────────

export async function deletePosition(
  id:    string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getPositionCollection().deleteOne({
    _id:      new ObjectId(id),
    orgId:    new ObjectId(orgId),
    isSystem: false,   // guard: system entries no se pueden borrar
  });

  return result.deletedCount > 0;
}

// ── Seed ──────────────────────────────────────────────────────────────────

export async function seedPositions(
  orgId:     string,
  createdBy: string,
  items:     PositionSeedItem[],
): Promise<void> {
  if (items.length === 0) return;

  const now = new Date();

  const docs: Omit<PositionDocument, '_id'>[] = items.map((item) => ({
    orgId:     new ObjectId(orgId),
    name:      item.name,
    key:       item.key,
    isSystem:  true,
    isActive:  true,
    createdBy: new ObjectId(createdBy),
    createdAt: now,
    updatedAt: now,
  }));

  await getPositionCollection().insertMany(docs as PositionDocument[]);
}

// ── Verificar si la key está asignada a algún empleado ────────────────────

export async function countEmployeesWithPosition(
  orgId: string,
  key:   string,
): Promise<number> {
  const { getUserCollection } = await import('../../users/user.model');

  return getUserCollection().countDocuments({
    orgId:                      new ObjectId(orgId),
    'employeeProfile.position': key,
  });
}
