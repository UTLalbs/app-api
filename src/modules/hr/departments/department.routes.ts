import { Router } from 'express';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import {
  createDepartmentHandler,
  deleteDepartmentHandler,
  getDepartments,
  updateDepartmentHandler,
} from './department.controller';
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  listDepartmentsSchema,
  updateDepartmentSchema,
} from './department.validator';

export const departmentRouter = Router();

departmentRouter.use(authenticate);

// GET /api/v1/hr/departments
departmentRouter.get(
  '/',
  validate(listDepartmentsSchema),
  authorize('employees', 'read'),
  getDepartments,
);

// POST /api/v1/hr/departments
departmentRouter.post(
  '/',
  validate(createDepartmentSchema),
  authorize('employees', 'create'),
  createDepartmentHandler,
);

// PATCH /api/v1/hr/departments/:id
departmentRouter.patch(
  '/:id',
  validate(updateDepartmentSchema),
  authorize('employees', 'update'),
  updateDepartmentHandler,
);

// DELETE /api/v1/hr/departments/:id
departmentRouter.delete(
  '/:id',
  validate(departmentIdParamSchema),
  authorize('employees', 'delete'),
  deleteDepartmentHandler,
);
