import { ObjectId } from 'mongodb';

import { getDepartmentCollection } from './department.model';
import type {
  CreateDepartmentDto,
  Department,
  DepartmentDocument,
  DepartmentQueryFilter,
  DepartmentSeedItem,
  UpdateDepartmentDto,
} from './department.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toDepartment(doc: DepartmentDocument): Department {
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

export async function findDepartments(
  orgId:  string,
  filter: DepartmentQueryFilter,
): Promise<Department[]> {
  const query: Record<string, unknown> = { orgId: new ObjectId(orgId) };

  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.isSystem !== undefined) query.isSystem = filter.isSystem;

  const docs = await getDepartmentCollection()
    .find(query)
    .sort({ name: 1 })
    .toArray();

  return docs.map((doc) => toDepartment(doc as DepartmentDocument));
}

// ── Buscar por ID ──────────────────────────────────────────────────────────

export async function findDepartmentById(
  id:    string,
  orgId: string,
): Promise<Department | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getDepartmentCollection().findOne({
    _id:   new ObjectId(id),
    orgId: new ObjectId(orgId),
  });

  return doc ? toDepartment(doc as DepartmentDocument) : null;
}

// ── Buscar por key ────────────────────────────────────────────────────────

export async function findDepartmentByKey(
  orgId: string,
  key:   string,
): Promise<Department | null> {
  const doc = await getDepartmentCollection().findOne({
    orgId: new ObjectId(orgId),
    key,
  });

  return doc ? toDepartment(doc as DepartmentDocument) : null;
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function createDepartment(dto: CreateDepartmentDto): Promise<Department> {
  const now = new Date();

  const doc: Omit<DepartmentDocument, '_id'> = {
    orgId:     new ObjectId(dto.orgId),
    name:      dto.name,
    key:       dto.key,
    isSystem:  dto.isSystem,
    isActive:  dto.isActive,
    createdBy: new ObjectId(dto.createdBy),
    createdAt: now,
    updatedAt: now,
  };

  const result = await getDepartmentCollection().insertOne(doc as DepartmentDocument);

  return toDepartment({ _id: result.insertedId, ...doc } as DepartmentDocument);
}

// ── Actualizar ────────────────────────────────────────────────────────────

export async function updateDepartment(
  id:    string,
  orgId: string,
  dto:   UpdateDepartmentDto,
): Promise<Department | null> {
  if (!ObjectId.isValid(id)) return null;

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (dto.name     !== undefined) setFields.name     = dto.name;
  if (dto.isActive !== undefined) setFields.isActive = dto.isActive;

  const result = await getDepartmentCollection().findOneAndUpdate(
    { _id: new ObjectId(id), orgId: new ObjectId(orgId) },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result ? toDepartment(result as DepartmentDocument) : null;
}

// ── Eliminar ──────────────────────────────────────────────────────────────

export async function deleteDepartment(
  id:    string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getDepartmentCollection().deleteOne({
    _id:      new ObjectId(id),
    orgId:    new ObjectId(orgId),
    isSystem: false,
  });

  return result.deletedCount > 0;
}

// ── Seed ──────────────────────────────────────────────────────────────────

export async function seedDepartments(
  orgId:     string,
  createdBy: string,
  items:     DepartmentSeedItem[],
): Promise<void> {
  if (items.length === 0) return;

  const now = new Date();

  const docs: Omit<DepartmentDocument, '_id'>[] = items.map((item) => ({
    orgId:     new ObjectId(orgId),
    name:      item.name,
    key:       item.key,
    isSystem:  true,
    isActive:  true,
    createdBy: new ObjectId(createdBy),
    createdAt: now,
    updatedAt: now,
  }));

  await getDepartmentCollection().insertMany(docs as DepartmentDocument[]);
}

// ── Verificar si la key está asignada a algún empleado ────────────────────

export async function countEmployeesWithDepartment(
  orgId: string,
  key:   string,
): Promise<number> {
  const { getUserCollection } = await import('../../users/user.model');

  return getUserCollection().countDocuments({
    orgId:                         new ObjectId(orgId),
    'employeeProfile.department':  key,
  });
}
