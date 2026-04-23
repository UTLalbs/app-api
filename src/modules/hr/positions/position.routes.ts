import { Router } from 'express';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import {
  createPositionHandler,
  deletePositionHandler,
  getPositions,
  updatePositionHandler,
} from './position.controller';
import {
  createPositionSchema,
  listPositionsSchema,
  positionIdParamSchema,
  updatePositionSchema,
} from './position.validator';

export const positionRouter = Router();

positionRouter.use(authenticate);

// GET /api/v1/hr/positions
positionRouter.get(
  '/',
  validate(listPositionsSchema),
  authorize('employees', 'read'),
  getPositions,
);

// POST /api/v1/hr/positions
positionRouter.post(
  '/',
  validate(createPositionSchema),
  authorize('employees', 'create'),
  createPositionHandler,
);

// PATCH /api/v1/hr/positions/:id
positionRouter.patch(
  '/:id',
  validate(updatePositionSchema),
  authorize('employees', 'update'),
  updatePositionHandler,
);

// DELETE /api/v1/hr/positions/:id
positionRouter.delete(
  '/:id',
  validate(positionIdParamSchema),
  authorize('employees', 'delete'),
  deletePositionHandler,
);
