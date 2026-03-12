export const authPaths = {
  '/api/v1/auth/google': {
    get: {
      tags: ['Auth'],
      summary: 'Iniciar login con Google',
      description: 'Redirige al usuario a Google para autenticarse via OIDC',
      responses: {
        302: { description: 'Redirige a Google' },
        429: { description: 'Rate limit excedido' },
      },
    },
  },
  '/api/v1/auth/microsoft': {
    get: {
      tags: ['Auth'],
      summary: 'Iniciar login con Microsoft',
      description: 'Redirige al usuario a Microsoft Entra ID para autenticarse',
      responses: {
        302: { description: 'Redirige a Microsoft' },
        429: { description: 'Rate limit excedido' },
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Renovar access token',
      description: 'Usa el refresh token en cookie para emitir un nuevo access token',
      responses: {
        200: {
          description: 'Tokens renovados',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TokenResponse' },
            },
          },
        },
        401: { description: 'Refresh token inválido o expirado' },
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar sesión',
      responses: {
        200: { description: 'Sesión cerrada' },
      },
    },
  },
  '/api/v1/auth/logout-all': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar todas las sesiones',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Todas las sesiones cerradas' },
        401: { description: 'No autenticado' },
      },
    },
  },
  '/api/v1/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Obtener usuario autenticado',
      security: [{ cookieAuth: [] }],
      responses: {
        200: {
          description: 'Usuario actual',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/AuthenticatedUser' },
                },
              },
            },
          },
        },
        401: { description: 'No autenticado' },
      },
    },
  },
};