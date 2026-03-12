import type { Collection } from 'mongodb';

import { getDb } from '../../config/database';
import { logger } from '../../config/logger';

import type { UserDocument } from './user.types';

export function getUserCollection(): Collection<UserDocument> {
  return getDb().collection<UserDocument>('users');
}

export async function createUserIndexes(): Promise<void> {
  const collection = getUserCollection();

  await collection.createIndexes([
    // Email único — base del identity linking entre providers
    {
      key: { email: 1 },
      unique: true,
      name: 'email_unique',
    },
    // Búsqueda de usuarios por organización + estado
    {
      key: { orgId: 1, status: 1 },
      name: 'orgId_status',
    },
    // Soft delete — todos los queries filtran por esto
    {
      key: { deletedAt: 1 },
      name: 'deletedAt',
    },
    // SSO identity lookup — Google
    // sparse: true porque no todos los usuarios tienen googleSub
    {
      key: { 'identities.googleSub': 1 },
      sparse: true,
      name: 'identities_googleSub',
    },
    // SSO identity lookup — Microsoft
    {
      key: { 'identities.microsoftOid': 1 },
      sparse: true,
      name: 'identities_microsoftOid',
    },
  ]);

  logger.info('✅  User indexes created');
}