import type { UserStatus } from '../../modules/users/user.types';

export const USER_STATUS = {
  PENDING:   'pending',
  ACTIVE:    'active',
  INACTIVE:  'inactive',
  SUSPENDED: 'suspended',
} as const satisfies Record<string, UserStatus>;
