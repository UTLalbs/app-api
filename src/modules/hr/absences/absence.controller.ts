import type { Request, Response } from 'express';

import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../../shared/utils/auditContext';

import {
  editCategory,
  getCategory,
  listCategories,
  registerCategory,
  removeCategory,
} from './absence-category.service';
import {
  getBalance,
  listBalances,
  recalculateBalance,
} from './absence-balance.service';
import {
  approveAbsence,
  assignCoverage,
  cancelAbsence,
  editAbsenceRequest,
  getAbsence,
  listAbsences,
  listActiveOnDate,
  previewConflicts,
  registerAbsenceRequest,
  rejectAbsence,
} from './absence.service';
import type {
  ActiveOnDateInput,
  ApproveAbsenceInput,
  AssignCoverageInput,
  CancelAbsenceInput,
  CheckConflictsInput,
  CreateAbsenceRequestInput,
  CreateCategoryInput,
  ListAbsenceRequestsInput,
  ListBalancesInput,
  RejectAbsenceInput,
  UpdateAbsenceRequestInput,
  UpdateCategoryInput,
  UserIdParamInput,
} from './absence.validator';

function effectiveOrgId(req: Request): string {
  return req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';
}

// ── Solicitudes ──────────────────────────────────────────────────────────

export const listAbsencesHandler = asyncHandler(
  async (req: Request & ListAbsenceRequestsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const { items, total } = await listAbsences(req.user!, orgId, {
      userId: req.query.userId,
      status: req.query.status,
      categoryKey: req.query.categoryKey,
      departmentKey: req.query.departmentKey,
      positionKey: req.query.positionKey,
      startDateFrom: req.query.startDateFrom,
      startDateTo: req.query.startDateTo,
      requestedAtFrom: req.query.requestedAtFrom,
      requestedAtTo: req.query.requestedAtTo,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({
      success: true,
      data: { items, total },
      meta: { page: req.query.page, pageSize: req.query.pageSize },
    });
  },
);

export const getAbsenceHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await getAbsence(String(req.params.id), orgId);
    res.json({ success: true, data: absence });
  },
);

export const createAbsenceHandler = asyncHandler(
  async (req: Request & CreateAbsenceRequestInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await registerAbsenceRequest(
      req.user!,
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: absence });
  },
);

export const updateAbsenceHandler = asyncHandler(
  async (req: Request & UpdateAbsenceRequestInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await editAbsenceRequest(
      String(req.params.id),
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.json({ success: true, data: absence });
  },
);

export const approveAbsenceHandler = asyncHandler(
  async (req: Request & ApproveAbsenceInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await approveAbsence(
      req.user!,
      String(req.params.id),
      orgId,
      req.body.notes,
      buildAuditContext(req),
    );
    res.json({ success: true, data: absence });
  },
);

export const rejectAbsenceHandler = asyncHandler(
  async (req: Request & RejectAbsenceInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await rejectAbsence(
      req.user!,
      String(req.params.id),
      orgId,
      {
        rejectionCategory: req.body.rejectionCategory,
        rejectionReason: req.body.rejectionReason,
        notes: req.body.notes,
      },
      buildAuditContext(req),
    );
    res.json({ success: true, data: absence });
  },
);

export const cancelAbsenceHandler = asyncHandler(
  async (req: Request & CancelAbsenceInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await cancelAbsence(
      req.user!,
      String(req.params.id),
      orgId,
      {
        cancellationCategory: req.body.cancellationCategory,
        cancellationReason: req.body.cancellationReason,
      },
      buildAuditContext(req),
    );
    res.json({ success: true, data: absence });
  },
);

export const assignCoverageHandler = asyncHandler(
  async (req: Request & AssignCoverageInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const absence = await assignCoverage(
      String(req.params.id),
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.json({ success: true, data: absence });
  },
);

export const checkConflictsHandler = asyncHandler(
  async (req: Request & CheckConflictsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const conflicts = await previewConflicts(orgId, {
      userId: req.query.userId,
      categoryKey: req.query.categoryKey,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json({ success: true, data: conflicts });
  },
);

export const activeOnDateHandler = asyncHandler(
  async (req: Request & ActiveOnDateInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const items = await listActiveOnDate(req.user!, orgId, req.params.date);
    res.json({ success: true, data: items, meta: { total: items.length } });
  },
);

// ── Saldos ────────────────────────────────────────────────────────────────

export const listBalancesHandler = asyncHandler(
  async (req: Request & ListBalancesInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const year = req.query.year ?? new Date().getFullYear();
    const items = await listBalances(orgId, year);
    res.json({ success: true, data: items });
  },
);

export const getBalanceHandler = asyncHandler(
  async (req: Request & UserIdParamInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const year = req.query.year ?? new Date().getFullYear();
    const balance = await getBalance(orgId, req.params.userId, year);
    res.json({ success: true, data: balance });
  },
);

export const recalculateBalanceHandler = asyncHandler(
  async (req: Request & UserIdParamInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const year = req.query.year ?? new Date().getFullYear();
    const balance = await recalculateBalance(
      orgId,
      req.params.userId,
      year,
    );
    res.json({ success: true, data: balance });
  },
);

// ── Categorías ────────────────────────────────────────────────────────────

export const listCategoriesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const includeInactive = req.query.includeInactive === 'true';
    const items = await listCategories(orgId, { includeInactive });
    res.json({ success: true, data: items });
  },
);

export const getCategoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const cat = await getCategory(String(req.params.id), orgId);
    res.json({ success: true, data: cat });
  },
);

export const createCategoryHandler = asyncHandler(
  async (req: Request & CreateCategoryInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const cat = await registerCategory(
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: cat });
  },
);

export const updateCategoryHandler = asyncHandler(
  async (req: Request & UpdateCategoryInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const cat = await editCategory(
      String(req.params.id),
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.json({ success: true, data: cat });
  },
);

export const deleteCategoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    await removeCategory(
      String(req.params.id),
      orgId,
      buildAuditContext(req),
    );
    res.status(204).send();
  },
);
