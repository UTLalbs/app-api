import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  getRoleById,
  listRoles,
  registerRole,
  editRole,
  removeRole,
} from './role.service';
import type { CreateRoleInput, UpdateRoleInput } from './role.validator';

export const getRole = asyncHandler(async (req: Request, res: Response) => {
  const role = await getRoleById(String(req.params.id));
  res.json({ success: true, data: role });
});

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const roles = await listRoles(req.user?.orgId);
  res.json({ success: true, data: roles, meta: { total: roles.length } });
});

export const createRole = asyncHandler(
  async (req: Request & CreateRoleInput, res: Response) => {
    const role = await registerRole({
      name: req.body.name,
      description: req.body.description,
      orgId: req.body.orgId ?? req.user!.orgId,
      permissions: req.body.permissions,
    });
    res.status(201).json({ success: true, data: role });
  },
);

export const updateRole = asyncHandler(
  async (req: Request & UpdateRoleInput, res: Response) => {
    const role = await editRole(String(req.params.id), {
      name: req.body.name,
      description: req.body.description,
      permissions: req.body.permissions,
    });
    res.json({ success: true, data: role });
  },
);

export const deleteRole = asyncHandler(
  async (req: Request, res: Response) => {
    await removeRole(String(req.params.id));
    res.status(204).send();
  },
);