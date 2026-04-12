import { ObjectId } from 'mongodb';

import { getDocumentCatalogCollection } from './document-catalog.model';
import type {
  CreateDocumentCatalogDto,
  DocumentCatalog,
  DocumentCatalogDocument,
  DocumentCatalogQueryFilter,
  DocumentCatalogSeedItem,
  UpdateDocumentCatalogDto,
} from './document-catalog.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toDocumentCatalog(doc: DocumentCatalogDocument): DocumentCatalog {
  return {
    id:         doc._id.toHexString(),
    orgId:      doc.orgId.toHexString(),
    name:       doc.name,
    type:       doc.type,
    category:   doc.category,
    required:   doc.required,
    hasExpiry:  doc.hasExpiry,
    hasRenewal: doc.hasRenewal,
    isSystem:   doc.isSystem,
    isActive:   doc.isActive,
    createdBy:  doc.createdBy.toHexString(),
    createdAt:  doc.createdAt,
    updatedAt:  doc.updatedAt,
  };
}

// ── Listar catálogo ────────────────────────────────────────────────────────

export async function findDocumentCatalog(
  orgId: string,
  filter: DocumentCatalogQueryFilter,
): Promise<DocumentCatalog[]> {
  const query: Record<string, unknown> = {
    orgId: new ObjectId(orgId),
  };

  if (filter.category !== undefined) query.category = filter.category;
  if (filter.isActive  !== undefined) query.isActive  = filter.isActive;

  const docs = await getDocumentCatalogCollection()
    .find(query)
    .sort({ category: 1, name: 1 })
    .toArray();

  return docs.map((doc) => toDocumentCatalog(doc as DocumentCatalogDocument));
}

// ── Buscar por ID ──────────────────────────────────────────────────────────

export async function findDocumentCatalogById(
  id: string,
  orgId: string,
): Promise<DocumentCatalog | null> {
  if (!ObjectId.isValid(id)) return null;

  const doc = await getDocumentCatalogCollection().findOne({
    _id:   new ObjectId(id),
    orgId: new ObjectId(orgId),
  });

  return doc ? toDocumentCatalog(doc as DocumentCatalogDocument) : null;
}

// ── Verificar si type existe en la org ────────────────────────────────────

export async function findDocumentCatalogByType(
  orgId: string,
  type:  string,
): Promise<DocumentCatalog | null> {
  const doc = await getDocumentCatalogCollection().findOne({
    orgId: new ObjectId(orgId),
    type,
  });

  return doc ? toDocumentCatalog(doc as DocumentCatalogDocument) : null;
}

// ── Crear documento ────────────────────────────────────────────────────────

export async function createDocumentCatalogEntry(
  dto: CreateDocumentCatalogDto,
): Promise<DocumentCatalog> {
  const now = new Date();

  const doc: Omit<DocumentCatalogDocument, '_id'> = {
    orgId:      new ObjectId(dto.orgId),
    name:       dto.name,
    type:       dto.type,
    category:   dto.category,
    required:   dto.required,
    hasExpiry:  dto.hasExpiry,
    hasRenewal: dto.hasRenewal,
    isSystem:   dto.isSystem,
    isActive:   dto.isActive,
    createdBy:  new ObjectId(dto.createdBy),
    createdAt:  now,
    updatedAt:  now,
  };

  const result = await getDocumentCatalogCollection().insertOne(
    doc as DocumentCatalogDocument,
  );

  return toDocumentCatalog({ _id: result.insertedId, ...doc } as DocumentCatalogDocument);
}

// ── Actualizar documento ───────────────────────────────────────────────────

export async function updateDocumentCatalogEntry(
  id:    string,
  orgId: string,
  dto:   UpdateDocumentCatalogDto,
): Promise<DocumentCatalog | null> {
  if (!ObjectId.isValid(id)) return null;

  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (dto.name       !== undefined) setFields.name       = dto.name;
  if (dto.category   !== undefined) setFields.category   = dto.category;
  if (dto.required   !== undefined) setFields.required   = dto.required;
  if (dto.hasExpiry  !== undefined) setFields.hasExpiry  = dto.hasExpiry;
  if (dto.hasRenewal !== undefined) setFields.hasRenewal = dto.hasRenewal;
  if (dto.isActive   !== undefined) setFields.isActive   = dto.isActive;

  const result = await getDocumentCatalogCollection().findOneAndUpdate(
    { _id: new ObjectId(id), orgId: new ObjectId(orgId) },
    { $set: setFields },
    { returnDocument: 'after' },
  );

  return result ? toDocumentCatalog(result as DocumentCatalogDocument) : null;
}

// ── Eliminar documento ─────────────────────────────────────────────────────

export async function deleteDocumentCatalogEntry(
  id:    string,
  orgId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const result = await getDocumentCatalogCollection().deleteOne({
    _id:      new ObjectId(id),
    orgId:    new ObjectId(orgId),
    isSystem: false,   // ← solo documentos no sistema
  });

  return result.deletedCount > 0;
}

// ── Seed — inicializar catálogo de una org nueva ───────────────────────────

export async function seedDocumentCatalog(
  orgId:     string,
  createdBy: string,
  items:     DocumentCatalogSeedItem[],
): Promise<void> {
  const now = new Date();

  const docs: Omit<DocumentCatalogDocument, '_id'>[] = items.map((item) => ({
    orgId:      new ObjectId(orgId),
    name:       item.name,
    type:       item.type,
    category:   item.category,
    required:   item.required,
    hasExpiry:  item.hasExpiry,
    hasRenewal: item.hasRenewal,
    isSystem:   true,
    isActive:   false,   // ← inactivo por default — org elige cuáles activar
    createdBy:  new ObjectId(createdBy),
    createdAt:  now,
    updatedAt:  now,
  }));

  await getDocumentCatalogCollection().insertMany(
    docs as DocumentCatalogDocument[],
  );
}

// ── Verificar si tipo está en uso en algún empleado ───────────────────────

export async function isDocumentTypeInUse(
  orgId: string,
  type:  string,
): Promise<boolean> {
  const { getUserCollection } = await import('../users/user.model');

  const count = await getUserCollection().countDocuments({
    orgId:                              new ObjectId(orgId),
    'employeeProfile.checklist.type':   type,
  });

  return count > 0;
}