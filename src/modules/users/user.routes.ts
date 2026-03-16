import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import{ authorize } from '../../middleware/authorize';
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


// Todas las rutas de users requieren autenticación
userRouter.use(authenticate);

userRouter.get('/',    validate(listUsersSchema),    authorize('users', 'read'),    getUsers);
userRouter.get('/:id', validate(userIdParamSchema),  authorize('users', 'read'),    getUser);
userRouter.post('/',   validate(createUserSchema),   authorize('users', 'create'),  createUser);
userRouter.patch('/:id',        validate(updateUserSchema),   authorize('users', 'update'),  updateUser);
userRouter.patch('/:id/status', validate(changeStatusSchema), authorize('users', 'update'),  updateUserStatus);
userRouter.delete('/:id', validate(userIdParamSchema), authorize('users', 'delete'), deleteUser);