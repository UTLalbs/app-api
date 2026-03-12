import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
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

organizationRouter.get('/',    authorize('organizations', 'read'),   getOrganizations);
organizationRouter.get('/:id', validate(orgIdParamSchema), authorize('organizations', 'read'),  getOrganization);
organizationRouter.post('/',   validate(createOrganizationSchema),   authorize('organizations', 'write'), createOrganization);
organizationRouter.patch('/:id', validate(updateOrganizationSchema), authorize('organizations', 'write'), updateOrganization);
organizationRouter.delete('/:id', validate(orgIdParamSchema),        authorize('organizations', 'delete'), deleteOrganization);