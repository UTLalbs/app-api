import { ObjectId } from 'mongodb';

import { getErrorReportCollection } from './error-report.model';
import type {
  CreateErrorReportDto,
  ErrorReport,
  ErrorReportDocument,
  ErrorReportQueryFilter,
  ErrorReportStatus,
} from './error-report.types';

// ── Conversión documento → dominio ─────────────────────────────────────────

function toErrorReport(doc: ErrorReportDocument): ErrorReport {
  return {
    id:          doc._id.toHexString(),
    frontendId:  doc.id,
    timestamp:   doc.timestamp,
    reportedBy:  doc.reportedBy,
    orgId:       doc.orgId ? doc.orgId.toHexString() : null,
    environment: doc.environment,
    entity:      doc.entity,
    entityId:    doc.entityId,
    entityName:  doc.entityName,
    errors:      doc.errors,
    userAgent:   doc.userAgent,
    url:         doc.url,
    status:      doc.status,
    createdAt:   doc.createdAt,
    updatedAt:   doc.updatedAt,
  };
}

// ── Deduplicación ──────────────────────────────────────────────────────────

export async function findDuplicateReport(
  entityId: string,
  errorCodes: string[],
): Promise<ErrorReport | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // últimas 24h

  const sortedCodes = [...errorCodes].sort();

  const doc = await getErrorReportCollection().findOne({
    entityId,
    createdAt: { $gte: since },
    // Verificar que los codes del reporte coincidan exactamente
    'errors.code': { $all: sortedCodes },
  });

  if (!doc) return null;

  // Verificar que el array sea exactamente igual (misma cantidad)
  const docCodes = [...doc.errors.map((e) => e.code)].sort();
  if (JSON.stringify(docCodes) !== JSON.stringify(sortedCodes)) return null;

  return toErrorReport(doc as ErrorReportDocument);
}

// ── Crear reporte ──────────────────────────────────────────────────────────

export async function createErrorReport(
  dto: CreateErrorReportDto,
): Promise<ErrorReport> {
  const now = new Date();

  const doc: Omit<ErrorReportDocument, '_id'> = {
    id:          dto.id,
    timestamp:   new Date(dto.timestamp),
    reportedBy:  dto.reportedBy,
    orgId:       dto.orgId ? new ObjectId(dto.orgId) : null,
    environment: dto.environment,
    entity:      dto.entity,
    entityId:    dto.entityId,
    entityName:  dto.entityName,
    errors:      dto.errors.map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp as unknown as string),
    })),
    userAgent:   dto.userAgent,
    url:         dto.url,
    status:      'pending',
    createdAt:   now,
    updatedAt:   now,
  };

  const result = await getErrorReportCollection().insertOne(
    doc as ErrorReportDocument,
  );

  return {
    id:          result.insertedId.toHexString(),
    frontendId:  doc.id,
    timestamp:   doc.timestamp,
    reportedBy:  doc.reportedBy,
    orgId:       doc.orgId ? doc.orgId.toHexString() : null,
    environment: doc.environment,
    entity:      doc.entity,
    entityId:    doc.entityId,
    entityName:  doc.entityName,
    errors:      doc.errors,
    userAgent:   doc.userAgent,
    url:         doc.url,
    status:      doc.status,
    createdAt:   doc.createdAt,
    updatedAt:   doc.updatedAt,
  };
}

// ── Listar reportes ────────────────────────────────────────────────────────

export async function findAllErrorReports(
  filter: ErrorReportQueryFilter,
): Promise<{ reports: ErrorReport[]; total: number }> {
  const {
    status,
    environment,
    page  = 1,
    limit = 50,
  } = filter;

  const query: Record<string, unknown> = {};

  if (status)      query.status      = status;
  if (environment) query.environment = environment;

  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    getErrorReportCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .toArray(),
    getErrorReportCollection().countDocuments(query),
  ]);

  return {
    reports: docs.map((doc) => toErrorReport(doc as ErrorReportDocument)),
    total,
  };
}

// ── Actualizar status ──────────────────────────────────────────────────────

export async function updateErrorReportStatus(
  id: string,
  status: ErrorReportStatus,
): Promise<ErrorReport | null> {
  if (!ObjectId.isValid(id)) return null;

  const result = await getErrorReportCollection().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!result) return null;

  return toErrorReport(result as ErrorReportDocument);
}