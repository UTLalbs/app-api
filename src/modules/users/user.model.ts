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
    // email único global
    {
      key: { email: 1 },
      unique: true,
      name: 'email_unique',
    },
    // buscar usuarios activos por organización
    {
      key: { orgId: 1, status: 1 },
      name: 'orgId_status',
    },
    // buscar por tipo y status
    {
      key: { orgId: 1, userType: 1, status: 1 },
      name: 'orgId_userType_status',
    },
    // soft delete
    {
      key: { orgId: 1, deletedAt: 1 },
      name: 'orgId_deletedAt',
    },
    // operadores disponibles — sparse porque solo aplica a drivers
    {
      key: { orgId: 1, 'employeeProfile.vehicleOperator.driverStatus': 1 },
      sparse: true,
      name: 'orgId_driverStatus',
    },
    // unidad asignada al operador — sparse
    {
      key: { orgId: 1, 'employeeProfile.vehicleOperator.currentUnitId': 1 },
      sparse: true,
      name: 'orgId_currentUnitId',
    },
    // contactos de cliente
    {
      key: { 'clientMemberships.clientId': 1 },
      sparse: true,
      name: 'clientMemberships_clientId',
    },
    // identidades SSO — sparse
    {
      key: { 'identities.google.sub': 1 },
      sparse: true,
      name: 'identities_google_sub',
    },
    {
      key: { 'identities.microsoft.sub': 1 },
      sparse: true,
      name: 'identities_microsoft_sub',
    },
  ]);

  logger.info('✅  User indexes created');
}