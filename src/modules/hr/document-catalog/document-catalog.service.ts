import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import {
  deleteFile,
  extractKeyFromUrl,
} from '../../../infrastructure/storage/s3.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/errors/AppError';

import {
  createDocumentCatalogEntry,
  deleteDocumentCatalogEntry,
  findDocumentCatalog,
  findDocumentCatalogById,
  findDocumentCatalogByType,
  findEmployeesUsingType,
  findProfilesUsingType,
  removeTypeFromProfiles,
  seedDocumentCatalog,
  updateDocumentCatalogEntry,
} from './document-catalog.repository';
import { DOCUMENT_CATALOG_SEED } from './document-catalog.seed';
import type {
  DocumentCatalog,
  DocumentCatalogCategory,
  DocumentCatalogQueryFilter,
  UpdateDocumentCatalogDto,
} from './document-catalog.types';

// ── Listar catálogo ────────────────────────────────────────────────────────

export async function listDocumentCatalog(
  orgId:  string,
  filter: DocumentCatalogQueryFilter,
): Promise<DocumentCatalog[]> {
  return findDocumentCatalog(orgId, filter);
}

// ── Crear documento personalizado ──────────────────────────────────────────

export async function createDocumentCatalogItem(
  orgId:   string,
  actorId: string,
  data: {
    name:       string;
    category:   DocumentCatalogCategory;
    required:   boolean;
    hasExpiry:  boolean;
    hasRenewal: boolean;
  },
): Promise<DocumentCatalog> {
  const type = data.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const existing = await findDocumentCatalogByType(orgId, type);
  if (existing) {
    throw new ConflictError(
      `Ya existe un documento con el tipo "${type}" en el catálogo`,
    );
  }

  const item = await createDocumentCatalogEntry({
    orgId,
    name:       data.name,
    type,
    category:   data.category,
    required:   data.required,
    hasExpiry:  data.hasExpiry,
    hasRenewal: data.hasRenewal,
    isSystem:   false,
    isActive:   false,
    createdBy:  actorId,
  });

  logger.info({ orgId, type, actorId }, 'Document catalog item created');

  return item;
}

// ── Actualizar documento ───────────────────────────────────────────────────

export async function editDocumentCatalogItem(
  id:   string,
  orgId: string,
  dto:  UpdateDocumentCatalogDto,
): Promise<DocumentCatalog> {
  const existing = await findDocumentCatalogById(id, orgId);
  if (!existing) throw new NotFoundError('DocumentCatalog');

  const updated = await updateDocumentCatalogEntry(id, orgId, dto);
  if (!updated) throw new NotFoundError('DocumentCatalog');

  logger.info({ id, orgId }, 'Document catalog item updated');

  return updated;
}

// ── Obtener uso del documento ──────────────────────────────────────────────

export async function getDocumentCatalogUsage(
  id:    string,
  orgId: string,
): Promise<{
  profiles:  { id: string; name: string }[];
  employees: { id: string; displayName: string }[];
}> {
  const existing = await findDocumentCatalogById(id, orgId);
  if (!existing) throw new NotFoundError('DocumentCatalog');

  const [profiles, employees] = await Promise.all([
    findProfilesUsingType(orgId, existing.type),
    findEmployeesUsingType(orgId, existing.type),
  ]);

  return { profiles, employees };
}

// ── Eliminar documento ─────────────────────────────────────────────────────

export async function removeDocumentCatalogItem(
  id:    string,
  orgId: string,
  force: boolean = false,
): Promise<void> {
  const existing = await findDocumentCatalogById(id, orgId);
  if (!existing) throw new NotFoundError('DocumentCatalog');

  if (existing.isSystem) {
    throw new ForbiddenError('No se pueden eliminar documentos del sistema');
  }

  const [profiles, employees] = await Promise.all([
    findProfilesUsingType(orgId, existing.type),
    findEmployeesUsingType(orgId, existing.type),
  ]);

  const inUse = profiles.length > 0 || employees.length > 0;

  if (inUse && !force) {
    throw new ConflictError(
      `El documento "${existing.name}" está en uso en ${profiles.length} perfiles y ${employees.length} empleados`,
    );
  }

  if (force && inUse) {
    const { getUserCollection } = await import('../../users/user.model');

    // 1 — Procesar cada empleado
    for (const emp of employees) {
      const user = await getUserCollection().findOne(
        { _id: new ObjectId(emp.id) },
        {
          projection: {
            'employeeProfile.documents': 1,
            'employeeProfile.checklist': 1,
          },
        },
      );

      const empDocs      = user?.employeeProfile?.documents ?? [];
      const empDoc = empDocs.find(
        (d: { type: string }) => d.type === existing.type,
      );

      if (empDoc) {
        const docWithMeta = empDoc as {
          fileUrl:          string;
          previousVersions: { fileUrl: string }[];
        };

        // b — Eliminar archivos del bucket — fire and forget
        const urls = [
          docWithMeta.fileUrl,
          ...(docWithMeta.previousVersions ?? []).map((v) => v.fileUrl),
        ];

        for (const url of urls) {
          const key = extractKeyFromUrl(url);
          deleteFile(key).catch((err) =>
            logger.error({ err, key }, 'Failed to delete file from S3 on force delete'),
          );
        }

        // c — Eliminar documento del array
        await getUserCollection().updateOne(
          { _id: new ObjectId(emp.id) },
          {
            $pull: { 'employeeProfile.documents': { type: existing.type } as never },
            $set:  { updatedAt: new Date() },
          },
        );
      }

      // d — Eliminar checklist item
      await getUserCollection().updateOne(
        { _id: new ObjectId(emp.id) },
        {
          $pull: { 'employeeProfile.checklist': { type: existing.type } as never },
          $set:  { updatedAt: new Date() },
        },
      );
    }

    // 2 — Eliminar de todos los perfiles
    await removeTypeFromProfiles(orgId, existing.type);

    logger.info(
      {
        type:           existing.type,
        orgId,
        profilesClean:  profiles.length,
        employeesClean: employees.length,
      },
      'Force deleted — cleaned up profiles and employees',
    );
  }

  // 3 — Eliminar del catálogo
  const deleted = await deleteDocumentCatalogEntry(id, orgId);
  if (!deleted) throw new NotFoundError('DocumentCatalog');

  logger.info({ id, orgId, force }, 'Document catalog item deleted');
}

// ── Seed — inicializar catálogo de org nueva ──────────────────────────────

export async function initDocumentCatalogForOrg(
  orgId:     string,
  createdBy: string,
): Promise<void> {
  await seedDocumentCatalog(orgId, createdBy, DOCUMENT_CATALOG_SEED);

  logger.info(
    { orgId, total: DOCUMENT_CATALOG_SEED.length },
    'Document catalog seeded for new org',
  );
}