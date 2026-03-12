export const organizationPaths = {
  '/api/v1/organizations': {
    get: {
      tags: ['Organizations'],
      summary: 'Listar organizaciones',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Lista de organizaciones' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
      },
    },
    post: {
      tags: ['Organizations'],
      summary: 'Crear organización',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateOrganizationBody' },
          },
        },
      },
      responses: {
        201: { description: 'Organización creada' },
        409: { description: 'Slug ya existe' },
      },
    },
  },
  '/api/v1/organizations/{id}': {
    get: {
      tags: ['Organizations'],
      summary: 'Obtener organización por ID',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Organización encontrada' },
        404: { description: 'No encontrada' },
      },
    },
    patch: {
      tags: ['Organizations'],
      summary: 'Actualizar organización',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Organización actualizada' },
        404: { description: 'No encontrada' },
      },
    },
    delete: {
      tags: ['Organizations'],
      summary: 'Eliminar organización',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        204: { description: 'Organización eliminada' },
        404: { description: 'No encontrada' },
      },
    },
  },
};