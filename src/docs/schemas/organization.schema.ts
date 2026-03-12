export const organizationSchemas = {
  Organization: {
    type: 'object',
    properties: {
      id:     { type: 'string' },
      name:   { type: 'string', example: 'Unidos Transport' },
      slug:   { type: 'string', example: 'unidos-transport' },
      status: { type: 'string', enum: ['active', 'suspended', 'trial'] },
      settings: {
        type: 'object',
        properties: {
          allowedEmailDomains: { type: 'array', items: { type: 'string' } },
          maxUsers: { type: 'number' },
        },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateOrganizationBody: {
    type: 'object',
    required: ['name'],
    properties: {
      name:     { type: 'string', example: 'Unidos Transport' },
      slug:     { type: 'string', example: 'unidos-transport' },
      settings: {
        type: 'object',
        properties: {
          allowedEmailDomains: { type: 'array', items: { type: 'string' } },
          maxUsers: { type: 'number' },
        },
      },
    },
  },
};