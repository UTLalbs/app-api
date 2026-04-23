import type { Request, Response } from 'express';

import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../../shared/utils/auditContext';

import {
  createDepartmentItem,
  editDepartmentItem,
  listDepartments,
  removeDepartmentItem,
} from './department.service';
import type {
  CreateDepartmentInput,
  ListDepartmentsInput,
  UpdateDepartmentInput,
} from './department.validator';

// ── GET /api/v1/hr/departments ────────────────────────────────────────────

export const getDepartments = asyncHandler(
  async (req: Request & ListDepartmentsInput, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    const isActive =
      req.query.isActive === 'true'
        ? true
        : req.query.isActive === 'false'
          ? false
          : undefined;
    const isSystem =
      req.query.isSystem === 'true'
        ? true
        : req.query.isSystem === 'false'
          ? false
          : undefined;

    const departments = await listDepartments(orgId, { isActive, isSystem });

    res.json({ success: true, data: departments, meta: { total: departments.length } });
  },
);

// ── POST /api/v1/hr/departments ───────────────────────────────────────────

export const createDepartmentHandler = asyncHandler(
  async (req: Request & CreateDepartmentInput, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    const department = await createDepartmentItem(
      orgId,
      req.user!.id,
      { name: req.body.name, key: req.body.key },
      buildAuditContext(req),
    );

    res.status(201).json({ success: true, data: department });
  },
);

// ── PATCH /api/v1/hr/departments/:id ──────────────────────────────────────

export const updateDepartmentHandler = asyncHandler(
  async (req: Request & UpdateDepartmentInput, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    const department = await editDepartmentItem(
      String(req.params.id),
      orgId,
      { name: req.body.name, isActive: req.body.isActive },
      buildAuditContext(req),
    );

    res.json({ success: true, data: department });
  },
);

// ── DELETE /api/v1/hr/departments/:id ─────────────────────────────────────

export const deleteDepartmentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    await removeDepartmentItem(
      String(req.params.id),
      orgId,
      buildAuditContext(req),
    );

    res.status(204).send();
  },
);
