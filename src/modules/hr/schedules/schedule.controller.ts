import type { Request, Response } from 'express';

import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../../shared/utils/auditContext';

import {
  editAssignment,
  editTemplate,
  getAssignment,
  getTemplate,
  listAssignments,
  listConflicts,
  listTemplates,
  registerAssignment,
  registerTemplate,
  removeAssignment,
  removeTemplate,
} from './schedule.service';
import type {
  CreateAssignmentInput,
  CreateTemplateInput,
  ListAssignmentsInput,
  ListConflictsInput,
  ListTemplatesInput,
  UpdateAssignmentInput,
  UpdateTemplateInput,
} from './schedule.validator';

function effectiveOrgId(req: Request): string {
  return req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';
}

// ── Templates ─────────────────────────────────────────────────────────────

export const getTemplatesHandler = asyncHandler(
  async (req: Request & ListTemplatesInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const templates = await listTemplates(req.user!, orgId, {
      isActive: req.query.isActive,
      shiftType: req.query.shiftType,
    });
    res.json({ success: true, data: templates });
  },
);

export const getTemplateByIdHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const tpl = await getTemplate(String(req.params.id), orgId);
    res.json({ success: true, data: tpl });
  },
);

export const createTemplateHandler = asyncHandler(
  async (req: Request & CreateTemplateInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const tpl = await registerTemplate(orgId, req.body, buildAuditContext(req));
    res.status(201).json({ success: true, data: tpl });
  },
);

export const updateTemplateHandler = asyncHandler(
  async (req: Request & UpdateTemplateInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const tpl = await editTemplate(
      String(req.params.id),
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.json({ success: true, data: tpl });
  },
);

export const deleteTemplateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    await removeTemplate(
      String(req.params.id),
      orgId,
      buildAuditContext(req),
    );
    res.status(204).send();
  },
);

// ── Assignments ───────────────────────────────────────────────────────────

export const getAssignmentsHandler = asyncHandler(
  async (req: Request & ListAssignmentsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const schedules = await listAssignments(req.user!, orgId, {
      userId: req.query.userId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      departmentKey: req.query.departmentKey,
      positionKey: req.query.positionKey,
      locationId: req.query.locationId,
    });
    res.json({
      success: true,
      data: schedules,
      meta: { total: schedules.length },
    });
  },
);

export const getAssignmentByIdHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    const schedule = await getAssignment(String(req.params.id), orgId);
    res.json({ success: true, data: schedule });
  },
);

export const createAssignmentHandler = asyncHandler(
  async (req: Request & CreateAssignmentInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const schedule = await registerAssignment(
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.status(201).json({ success: true, data: schedule });
  },
);

export const updateAssignmentHandler = asyncHandler(
  async (req: Request & UpdateAssignmentInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const schedule = await editAssignment(
      String(req.params.id),
      orgId,
      req.body,
      buildAuditContext(req),
    );
    res.json({ success: true, data: schedule });
  },
);

export const deleteAssignmentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = effectiveOrgId(req);
    await removeAssignment(
      String(req.params.id),
      orgId,
      buildAuditContext(req),
    );
    res.status(204).send();
  },
);

export const getConflictsHandler = asyncHandler(
  async (req: Request & ListConflictsInput, res: Response) => {
    const orgId = effectiveOrgId(req);
    const conflicts = await listConflicts(req.user!, orgId, {
      userId: req.query.userId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json({
      success: true,
      data: conflicts,
      meta: { total: conflicts.length },
    });
  },
);
