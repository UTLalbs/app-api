export const userSchemas = {
  User: {
    type: 'object',
    properties: {
      id:           { type: 'string', example: '6636b37f15d0e298d923ea54' },
      email:        { type: 'string', example: 'user@example.com' },
      displayName:  { type: 'string', example: 'Erick Solis' },
      status:       { type: 'string', enum: ['active', 'disabled', 'pending'] },
      orgId:        { type: 'string' },
      roles:        { type: 'array', items: { type: 'string' } },
      clientId:     { type: 'string', nullable: true },
      lastLoginAt:  { type: 'string', format: 'date-time', nullable: true },
      createdAt:    { type: 'string', format: 'date-time' },
      updatedAt:    { type: 'string', format: 'date-time' },
    },
  },
  CreateUserBody: {
    type: 'object',
    required: ['email', 'displayName'],
    properties: {
      email:       { type: 'string', format: 'email' },
      displayName: { type: 'string', minLength: 2 },
      roles:       { type: 'array', items: { type: 'string' } },
      clientId:    { type: 'string', nullable: true },
    },
  },
  UpdateUserBody: {
    type: 'object',
    properties: {
      displayName: { type: 'string', minLength: 2 },
      roles:       { type: 'array', items: { type: 'string' } },
      clientId:    { type: 'string', nullable: true },
    },
  },
  ChangeStatusBody: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['active', 'disabled', 'pending'] },
    },
  },
};