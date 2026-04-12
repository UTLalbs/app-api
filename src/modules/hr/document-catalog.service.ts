import { logger } from '../../config/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';

import
{
	createDocumentCatalogEntry,
	deleteDocumentCatalogEntry,
	findDocumentCatalog,
	findDocumentCatalogById,
	findDocumentCatalogByType,
	isDocumentTypeInUse,
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
  orgId:  string,
  actorId: string,
  data: {
    name:       string;
    category:   DocumentCatalogCategory;
    required:   boolean;
    hasExpiry:  boolean;
    hasRenewal: boolean;
  },
): Promise<DocumentCatalog> {
  // Generar type desde el nombre — lowercase + guiones
  const type = data.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  // Verificar que el type no exista ya en la org
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
    isActive:   false,   // ← inactivo por default
    createdBy:  actorId,
  });

  logger.info(
    { orgId, type, actorId },
    'Document catalog item created',
  );

  return item;
}

// ── Actualizar documento ───────────────────────────────────────────────────

export async function editDocumentCatalogItem(
  id:     string,
  orgId:  string,
  dto:    UpdateDocumentCatalogDto,
): Promise<DocumentCatalog> {
  const existing = await findDocumentCatalogById(id, orgId);
  if (!existing) throw new NotFoundError('DocumentCatalog');

  const updated = await updateDocumentCatalogEntry(id, orgId, dto);
  if (!updated) throw new NotFoundError('DocumentCatalog');

  logger.info({ id, orgId }, 'Document catalog item updated');

  return updated;
}

// ── Eliminar documento ─────────────────────────────────────────────────────

export async function removeDocumentCatalogItem(
  id:    string,
  orgId: string,
): Promise<void> {
  const existing = await findDocumentCatalogById(id, orgId);
  if (!existing) throw new NotFoundError('DocumentCatalog');

  // No se pueden eliminar documentos del sistema
  if (existing.isSystem) {
    throw new ForbiddenError(
      'No se pueden eliminar documentos del sistema',
    );
  }

  // Verificar si está en uso en algún empleado
  const inUse = await isDocumentTypeInUse(orgId, existing.type);
  if (inUse) {
    throw new ConflictError(
      `El documento "${existing.name}" está en uso en perfiles de empleados`,
    );
  }

  const deleted = await deleteDocumentCatalogEntry(id, orgId);
  if (!deleted) throw new NotFoundError('DocumentCatalog');

  logger.info({ id, orgId }, 'Document catalog item deleted');
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