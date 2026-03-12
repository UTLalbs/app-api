export const roleSchemas = {
  Permission: {
    type: 'object',
    required: ['resource', 'actions'],
    properties: {
      resource: { type: 'string', example: 'services' },
      actions: {
        type: 'array',
        items: { type: 'string', enum: ['read', 'write', 'delete', 'admin'] },
      },
    },
  },
  Role: {
    type: 'object',
    properties: {
      id:          { type: 'string' },
      name:        { type: 'string', example: 'operaciones' },
      description: { type: 'string' },
      orgId:       { type: 'string', nullable: true },
      isSystem:    { type: 'boolean' },
      permissions: {
        type: 'array',
        items: { $ref: '#/components/schemas/Permission' },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateRoleBody: {
    type: 'object',
    required: ['name', 'description', 'permissions'],
    properties: {
      name:        { type: 'string', example: 'supervisor' },
      description: { type: 'string' },
      permissions: {
        type: 'array',
        items: { $ref: '#/components/schemas/Permission' },
      },
    },
  },
};