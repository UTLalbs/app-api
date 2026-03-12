export const rolePaths = {
  '/api/v1/roles': {
    get: {
      tags: ['Roles'],
      summary: 'Listar roles',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Lista de roles' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
      },
    },
    post: {
      tags: ['Roles'],
      summary: 'Crear rol',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateRoleBody' },
          },
        },
      },
      responses: {
        201: { description: 'Rol creado' },
        400: { description: 'Datos inválidos' },
        409: { description: 'Nombre de rol ya existe' },
      },
    },
  },
  '/api/v1/roles/{id}': {
    get: {
      tags: ['Roles'],
      summary: 'Obtener rol por ID',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Rol encontrado' },
        404: { description: 'No encontrado' },
      },
    },
    patch: {
      tags: ['Roles'],
      summary: 'Actualizar rol',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Rol actualizado' },
        403: { description: 'Roles del sistema no se pueden modificar' },
        404: { description: 'No encontrado' },
      },
    },
    delete: {
      tags: ['Roles'],
      summary: 'Eliminar rol',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        204: { description: 'Rol eliminado' },
        403: { description: 'Roles del sistema no se pueden eliminar' },
        404: { description: 'No encontrado' },
      },
    },
  },
};