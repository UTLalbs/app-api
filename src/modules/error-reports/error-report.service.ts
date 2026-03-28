import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NotFoundError } from '../../shared/errors/AppError';

import {
  findDuplicateReport,
  createErrorReport,
  findAllErrorReports,
  updateErrorReportStatus,
} from './error-report.repository';
import type {
  CreateErrorReportDto,
  ErrorReport,
  ErrorReportItem,
  ErrorReportQueryFilter,
  ErrorReportStatus,
} from './error-report.types';

// ── Notificación ───────────────────────────────────────────────────────────
// Fire and forget — no bloquea el response
// Preparada para recibir email/webhook en el futuro

async function notifyDeveloper(
  report: ErrorReport,
  criticalErrors: ErrorReportItem[],
): Promise<void> {
  try {
    logger.warn(
      {
        reportId:      report.id,
        entityId:      report.entityId,
        entityName:    report.entityName,
        environment:   report.environment,
        url:           report.url,
        reportedBy:    report.reportedBy,
        developerEmail: env.DEVELOPER_EMAIL,
        criticalErrors: criticalErrors.map((e) => ({
          code:      e.code,
          severity:  e.severity,
          title:     e.title,
          message:   e.message,
          technical: e.technical,
        })),
      },
      '🚨 Critical/Error severity report received — developer notification',
    );

    // TODO: implementar envío de email cuando se agregue nodemailer/sendgrid
    // TODO: implementar webhook a Jira/Slack/WhatsApp
  } catch (err) {
    logger.error({ err }, 'Failed to send developer notification');
  }
}

// ── Crear reporte ──────────────────────────────────────────────────────────

export async function submitErrorReport(
  dto: CreateErrorReportDto,
): Promise<{ id: string; isDuplicate: boolean }> {
  const errorCodes = dto.errors.map((e) => e.code);

  // Verificar duplicado en las últimas 24 horas
  const duplicate = await findDuplicateReport(dto.entityId, errorCodes);

  if (duplicate) {
    logger.info(
      { existingId: duplicate.id, entityId: dto.entityId },
      'Duplicate error report detected — returning existing',
    );
    return { id: duplicate.id, isDuplicate: true };
  }

  // Crear reporte nuevo
  const report = await createErrorReport(dto);

  logger.info(
    {
      reportId:    report.id,
      entityId:    report.entityId,
      environment: report.environment,
      errorCount:  report.errors.length,
    },
    'Error report created',
  );

  // Notificar si hay errores críticos — fire and forget
  const criticalErrors = dto.errors.filter(
    (e) => e.severity === 'critical' || e.severity === 'error',
  );

  if (criticalErrors.length > 0) {
    notifyDeveloper(report, criticalErrors).catch((err) =>
      logger.error({ err }, 'notifyDeveloper fire-and-forget failed'),
    );
  }

  return { id: report.id, isDuplicate: false };
}

// ── Listar reportes ────────────────────────────────────────────────────────

export async function listErrorReports(
  filter: ErrorReportQueryFilter,
): Promise<{ reports: ErrorReport[]; total: number }> {
  return findAllErrorReports(filter);
}

// ── Actualizar status ──────────────────────────────────────────────────────

export async function resolveErrorReport(
  id: string,
  status: ErrorReportStatus,
): Promise<{ id: string; status: ErrorReportStatus }> {
  const updated = await updateErrorReportStatus(id, status);

  if (!updated) throw new NotFoundError('ErrorReport');

  logger.info({ reportId: id, status }, 'Error report status updated');

  return { id: updated.id, status: updated.status };
}