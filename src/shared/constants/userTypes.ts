import type { UserType } from '../../modules/users/user.types';

export const USER_TYPE = {
  INTERNAL:       'internal',
  CLIENT_CONTACT: 'client_contact',
  SUPER_ADMIN:    'super_admin',
} as const satisfies Record<string, UserType>;
