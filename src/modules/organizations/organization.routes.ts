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
organizationRouter.use(authenticate);

organizationRouter.get('/',    authorize('users', 'read'),    getOrganizations);
// GET /:id no usa authorize: cualquier usuario autenticado puede leer su propia
// org (necesario para que AppLayout descubra qué features están habilitadas).
// El controller verifica que sea su propia org o que sea super_admin.
organizationRouter.get('/:id', validate(orgIdParamSchema),    getOrganization);
organizationRouter.post('/',   validate(createOrganizationSchema), authorize('users', 'create'), createOrganization);
organizationRouter.patch('/:id', validate(updateOrganizationSchema), authorize('users', 'update'), updateOrganization);
organizationRouter.delete('/:id', validate(orgIdParamSchema), authorize('users', 'delete'), deleteOrganization);