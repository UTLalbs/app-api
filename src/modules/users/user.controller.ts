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
  const user = await getUserById(String(req.params.id), req.user!.orgId);
  res.json({ success: true, data: user });
});

export const getUsers = asyncHandler(
  async (req: Request & ListUsersInput, res: Response) => {
    const users = await listUsers(req.user!.orgId, {
      status: req.query.status,
    });
    res.json({ success: true, data: users, meta: { total: users.length } });
  },
);

export const createUser = asyncHandler(
  async (req: Request & CreateUserInput, res: Response) => {
    const user = await registerUser({
      email: req.body.email,
      displayName: req.body.displayName,
      orgId: req.user!.orgId,
      roles: req.body.roles,
    });
    res.status(201).json({ success: true, data: user });
  },
);

export const updateUser = asyncHandler(
  async (req: Request & UpdateUserInput, res: Response) => {
    const user = await editUser(String(req.params.id), req.user!.orgId, {
      displayName: req.body.displayName,
      roles: req.body.roles,
    });
    res.json({ success: true, data: user });
  },
);

export const updateUserStatus = asyncHandler(
  async (req: Request & ChangeStatusInput, res: Response) => {
    const user = await changeUserStatus(
      String(req.params.id),
      req.user!.orgId,
      req.body.status,
      req.user!.id,
    );
    res.json({ success: true, data: user });
  },
);

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await removeUser(String(req.params.id), req.user!.orgId, req.user!.id);
  res.status(204).send();
});