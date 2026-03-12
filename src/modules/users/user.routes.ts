import { Router } from 'express';

import { validate } from '../../middleware/validate';

import {
  createUser,
  deleteUser,
  getUser,
  getUsers,
  updateUser,
  updateUserStatus,
} from './user.controller';
import {
  changeStatusSchema,
  createUserSchema,
  listUsersSchema,
  updateUserSchema,
  userIdParamSchema,
} from './user.validator';

export const userRouter = Router();

// GET /api/v1/users
userRouter.get(
  '/',
  validate(listUsersSchema),
  getUsers,
);

// GET /api/v1/users/:id
userRouter.get(
  '/:id',
  validate(userIdParamSchema),
  getUser,
);

// POST /api/v1/users
userRouter.post(
  '/',
  validate(createUserSchema),
  createUser,
);

// PATCH /api/v1/users/:id
userRouter.patch(
  '/:id',
  validate(updateUserSchema),
  updateUser,
);

// PATCH /api/v1/users/:id/status
userRouter.patch(
  '/:id/status',
  validate(changeStatusSchema),
  updateUserStatus,
);

// DELETE /api/v1/users/:id
userRouter.delete(
  '/:id',
  validate(userIdParamSchema),
  deleteUser,
);