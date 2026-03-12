export const userPaths = {
  '/api/v1/users': {
    get: {
      tags: ['Users'],
      summary: 'Listar usuarios',
      security: [{ cookieAuth: [] }],
      parameters: [
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'disabled', 'pending'] },
        },
      ],
      responses: {
        200: {
          description: 'Lista de usuarios',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                  meta: {
                    type: 'object',
                    properties: { total: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
      },
    },
    post: {
      tags: ['Users'],
      summary: 'Crear usuario',
      security: [{ cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateUserBody' },
          },
        },
      },
      responses: {
        201: { description: 'Usuario creado' },
        400: { description: 'Datos inválidos' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
        409: { description: 'Email ya registrado' },
      },
    },
  },
  '/api/v1/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Obtener usuario por ID',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Usuario encontrado' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
        404: { description: 'No encontrado' },
      },
    },
    patch: {
      tags: ['Users'],
      summary: 'Actualizar usuario',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateUserBody' },
          },
        },
      },
      responses: {
        200: { description: 'Usuario actualizado' },
        400: { description: 'Datos inválidos' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
        404: { description: 'No encontrado' },
      },
    },
    delete: {
      tags: ['Users'],
      summary: 'Eliminar usuario (soft delete)',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        204: { description: 'Usuario eliminado' },
        401: { description: 'No autenticado' },
        403: { description: 'Sin permiso' },
        404: { description: 'No encontrado' },
      },
    },
  },
  '/api/v1/users/{id}/status': {
    patch: {
      tags: ['Users'],
      summary: 'Cambiar status del usuario',
      security: [{ cookieAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ChangeStatusBody' },
          },
        },
      },
      responses: {
        200: { description: 'Status actualizado' },
        403: { description: 'Sin permiso o auto-cambio' },
        404: { description: 'No encontrado' },
      },
    },
  },
};