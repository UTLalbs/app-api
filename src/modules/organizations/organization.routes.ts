import { Router } from 'express';

import { validate } from '../../middleware/validate';

import {
  createOrganization,
  deleteOrganization,
  getOrganization,
  getOrganizations,
  updateOrganization,
} from './organization.controller';
import {
  createOrganizationSchema,
  orgIdParamSchema,
  updateOrganizationSchema,
} from './organization.validator';

export const organizationRouter = Router();

// GET /api/v1/organizations
organizationRouter.get('/', getOrganizations);

// GET /api/v1/organizations/:id
organizationRouter.get(
  '/:id',
  validate(orgIdParamSchema),
  getOrganization,
);

// POST /api/v1/organizations
organizationRouter.post(
  '/',
  validate(createOrganizationSchema),
  createOrganization,
);

// PATCH /api/v1/organizations/:id
organizationRouter.patch(
  '/:id',
  validate(updateOrganizationSchema),
  updateOrganization,
);

// DELETE /api/v1/organizations/:id
organizationRouter.delete(
  '/:id',
  validate(orgIdParamSchema),
  deleteOrganization,
);