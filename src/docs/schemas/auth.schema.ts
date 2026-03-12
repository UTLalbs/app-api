export const authSchemas = {
  TokenResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
    },
  },
  AuthenticatedUser: {
    type: 'object',
    properties: {
      id:           { type: 'string', example: '6636b37f15d0e298d923ea54' },
      email:        { type: 'string', example: 'user@example.com' },
      displayName:  { type: 'string', example: 'Erick Solis' },
      orgId:        { type: 'string', example: '6636b37f15d0e298d923ea55' },
      roles:        { type: 'array', items: { type: 'string' } },
      clientId:     { type: 'string', nullable: true },
    },
  },
};