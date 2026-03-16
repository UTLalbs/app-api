import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';

import {
  createRole,
  deleteRole,
  getRole,
  getRoles,
  updateRole,
} from './role.controller';
import {
  createRoleSchema,
  roleIdParamSchema,
  updateRoleSchema,
} from './role.validator';

export const roleRouter = Router();

roleRouter.use(authenticate);

roleRouter.get('/',     authorize('roles', 'read'),    getRoles);
roleRouter.get('/:id',  validate(roleIdParamSchema),   authorize('roles', 'read'),    getRole);
roleRouter.post('/',    validate(createRoleSchema),    authorize('roles', 'create'),  createRole);
roleRouter.patch('/:id', validate(updateRoleSchema),   authorize('roles', 'update'),  updateRole);
roleRouter.delete('/:id', validate(roleIdParamSchema), authorize('roles', 'delete'),  deleteRole);