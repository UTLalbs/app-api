import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';

import {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
} from './task.controller';
import {
  createTaskSchema,
  listTasksSchema,
  taskIdParamSchema,
  updateTaskSchema,
} from './task.validator';

export const taskRouter = Router();

taskRouter.use(authenticate);

// GET /api/v1/tasks
taskRouter.get(
  '/',
  validate(listTasksSchema),
  getTasks,
);

// POST /api/v1/tasks
taskRouter.post(
  '/',
  validate(createTaskSchema),
  createTask,
);

// GET /api/v1/tasks/:id
taskRouter.get(
  '/:id',
  validate(taskIdParamSchema),
  getTaskById,
);

// PATCH /api/v1/tasks/:id
taskRouter.patch(
  '/:id',
  validate(updateTaskSchema),
  updateTask,
);

// DELETE /api/v1/tasks/:id — solo super_admin
taskRouter.delete(
  '/:id',
  validate(taskIdParamSchema),
  authorize('settings', 'delete'),
  deleteTask,
);