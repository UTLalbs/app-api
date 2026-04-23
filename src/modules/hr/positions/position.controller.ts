import type { Request, Response } from 'express';

import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../../shared/utils/auditContext';

import {
  createPositionItem,
  editPositionItem,
  listPositions,
  removePositionItem,
} from './position.service';
import type {
  CreatePositionInput,
  ListPositionsInput,
  UpdatePositionInput,
} from './position.validator';

// ── GET /api/v1/hr/positions ──────────────────────────────────────────────

export const getPositions = asyncHandler(
  async (req: Request & ListPositionsInput, res: Response) => {
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

    const positions = await listPositions(orgId, { isActive, isSystem });

    res.json({ success: true, data: positions, meta: { total: positions.length } });
  },
);

// ── POST /api/v1/hr/positions ─────────────────────────────────────────────

export const createPositionHandler = asyncHandler(
  async (req: Request & CreatePositionInput, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    const position = await createPositionItem(
      orgId,
      req.user!.id,
      { name: req.body.name, key: req.body.key },
      buildAuditContext(req),
    );

    res.status(201).json({ success: true, data: position });
  },
);

// ── PATCH /api/v1/hr/positions/:id ────────────────────────────────────────

export const updatePositionHandler = asyncHandler(
  async (req: Request & UpdatePositionInput, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    const position = await editPositionItem(
      String(req.params.id),
      orgId,
      { name: req.body.name, isActive: req.body.isActive },
      buildAuditContext(req),
    );

    res.json({ success: true, data: position });
  },
);

// ── DELETE /api/v1/hr/positions/:id ───────────────────────────────────────

export const deletePositionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? '';

    await removePositionItem(
      String(req.params.id),
      orgId,
      buildAuditContext(req),
    );

    res.status(204).send();
  },
);
