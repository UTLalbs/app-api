import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
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

// Todas las rutas de organizations requieren autenticación
organizationRouter.use( authenticate );


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