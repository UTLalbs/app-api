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
    // contactos de cliente
    {
      key: { 'clientMemberships.clientId': 1 },
      sparse: true,
      name: 'clientMemberships_clientId',
    },
    // ── Employee indexes ───────────────────────────────────────────────
    {
      key: { 'employeeProfile.isEmployee': 1 },
      sparse: true,
      name: 'employee_isEmployee',
    },
    {
      key: { 'employeeProfile.employeeType': 1 },
      sparse: true,
      name: 'employee_employeeType',
    },
    {
      key: { 'employeeProfile.department': 1 },
      sparse: true,
      name: 'employee_department',
    },
    {
      key: { 'employeeProfile.position': 1 },
      sparse: true,
      name: 'employee_position',
    },
    {
      key: { 'employeeProfile.employmentStatus': 1 },
      sparse: true,
      name: 'employee_employmentStatus',
    },
    {
      key: { 'employeeProfile.managerId': 1 },
      sparse: true,
      name: 'employee_managerId',
    },
    {
      key: { 'employeeProfile.vehicleOperator.driverStatus': 1 },
      sparse: true,
      name: 'employee_driverStatus',
    },
    {
      key: { 'employeeProfile.documents.expiresAt': 1 },
      sparse: true,
      name: 'employee_documents_expiresAt',
    },
    {
      key: { 'employeeProfile.documents.status': 1 },
      sparse: true,
      name: 'employee_documents_status',
    },
    {
      key: { 'employeeProfile.checklist.status': 1 },
      sparse: true,
      name: 'employee_checklist_status',
    },
  ]);

  logger.info('✅  User indexes created');
}