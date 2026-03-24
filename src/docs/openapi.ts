import { authPaths } from './paths/auth.paths';
import { organizationPaths } from './paths/organization.paths';
import { rolePaths } from './paths/role.paths';
import { userPaths } from './paths/user.paths';
import { authSchemas } from './schemas/auth.schema';
import { organizationSchemas } from './schemas/organization.schema';
import { roleSchemas } from './schemas/role.schema';
import { userSchemas } from './schemas/user.schema';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'API',
    description: 'API — Backend modernization',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development',
    },
  ],
  tags: [
    { name: 'Auth',          description: 'Autenticación y sesiones' },
    { name: 'Users',         description: 'Gestión de usuarios' },
    { name: 'Roles',         description: 'Gestión de roles y permisos' },
    { name: 'Organizations', description: 'Gestión de organizaciones' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
      },
    },
    schemas: {
      ...authSchemas,
      ...userSchemas,
      ...roleSchemas,
      ...organizationSchemas,
    },
  },
  paths: {
    ...authPaths,
    ...userPaths,
    ...rolePaths,
    ...organizationPaths,
  },
};