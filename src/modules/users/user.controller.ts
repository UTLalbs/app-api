import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  getUserById,
  listUsers,
  registerUser,
  editUser,
  changeUserStatus,
  removeUser,
} from './user.service';
import type {
  ChangeStatusInput,
  CreateUserInput,
  ListUsersInput,
  UpdateUserInput,
} from './user.validator';

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  // TODO Phase 3: reemplazar con req.user!.orgId
  const orgId = req.user?.orgId ?? req.query.orgId as string;
  const user = await getUserById(String(req.params.id), orgId);

  res.json({ success: true, data: user });
});

export const getUsers = asyncHandler(
  async (req: Request & ListUsersInput, res: Response) => {
    // TODO Phase 3: reemplazar con req.user!.orgId
    const orgId = req.user?.orgId ?? req.query.orgId as string;

    const users = await listUsers(orgId, {
      status: req.query.status,
    });

    res.json({ success: true, data: users, meta: { total: users.length } });
  },
);

export const createUser = asyncHandler(
  async (req: Request & CreateUserInput, res: Response) => {
    // TODO Phase 3: orgId vendrá de req.user!.orgId — nunca del body
    const orgId = req.user?.orgId ?? req.body.orgId as string;

    const user = await registerUser({
      email: req.body.email,
      displayName: req.body.displayName,
      orgId,
      roles: req.body.roles,
    });

    res.status(201).json({ success: true, data: user });
  },
);

export const updateUser = asyncHandler(
  async (req: Request & UpdateUserInput, res: Response) => {
    // TODO Phase 3: reemplazar con req.user!.orgId
    const orgId = req.user?.orgId ?? req.query.orgId as string;

    const user = await editUser(String(req.params.id), orgId, {
      displayName: req.body.displayName,
      roles: req.body.roles,
    });

    res.json({ success: true, data: user });
  },
);

export const updateUserStatus = asyncHandler(
  async (req: Request & ChangeStatusInput, res: Response) => {
    // TODO Phase 3: reemplazar con req.user!.orgId y req.user!.id
    const orgId = req.user?.orgId ?? req.query.orgId as string;
    const actorId = req.user?.id ?? 'temp-actor';

    const user = await changeUserStatus(
      String(req.params.id),
      orgId,
      req.body.status,
      actorId,
    );

    res.json({ success: true, data: user });
  },
);

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  // TODO Phase 3: reemplazar con req.user!.orgId y req.user!.id
  const orgId = req.user?.orgId ?? req.query.orgId as string;
  const actorId = req.user?.id ?? 'temp-actor';

  await removeUser(String(req.params.id), orgId, actorId);

  res.status(204).send();
});