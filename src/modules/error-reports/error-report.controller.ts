import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  submitErrorReport,
  listErrorReports,
  resolveErrorReport,
} from './error-report.service';
import type { ErrorReportStatus } from './error-report.types';
import type {
  CreateErrorReportInput,
  ListErrorReportsInput,
  UpdateErrorReportStatusInput,
} from './error-report.validator';

// ── POST /api/v1/error-reports ─────────────────────────────────────────────

export const createErrorReport = asyncHandler(
  async (req: Request & CreateErrorReportInput, res: Response) => {
    const result = await submitErrorReport({
      id:          req.body.id,
      timestamp:   req.body.timestamp,
      reportedBy:  req.body.reportedBy,
      orgId:       req.user!.orgId ?? null,
      environment: req.body.environment,
      entity:      req.body.entity,
      entityId:    req.body.entityId,
      entityName:  req.body.entityName,
      errors:      req.body.errors,
      userAgent:   req.body.userAgent,
      url:         req.body.url,
    });

    res.status(result.isDuplicate ? 200 : 201).json({
      success: true,
      data: { id: result.id },
    });
  },
);

// ── GET /api/v1/error-reports ──────────────────────────────────────────────

export const getErrorReports = asyncHandler(
  async (req: Request & ListErrorReportsInput, res: Response) => {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 50;

    const { reports, total } = await listErrorReports({
      status:      req.query.status      as ErrorReportStatus | undefined,
      environment: req.query.environment as 'development' | 'production' | undefined,
      page,
      limit,
    });

    res.json({
      success: true,
      data: reports,
      meta: { total, page, limit },
    });
  },
);

// ── PATCH /api/v1/error-reports/:id/status ────────────────────────────────

export const updateErrorReportStatus = asyncHandler(
  async (req: Request & UpdateErrorReportStatusInput, res: Response) => {
    const result = await resolveErrorReport(
      String(req.params.id),
      req.body.status as ErrorReportStatus,
    );

    res.json({ success: true, data: result });
  },
);