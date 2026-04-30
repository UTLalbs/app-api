import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';

import { getAbsenceCategoryCollection } from './absence.model';
import type { AbsenceCategoryDocument } from './absence.types';

interface SeedCategory {
  key: string;
  name: string;
  description: string;
  isPaid: boolean;
  consumesBalance: boolean;
  requiresApproval: boolean;
  requiresCertificate: boolean;
  maxDaysPerRequest: number | null;
  legalMinimumDays: number | null;
  hrApprovalThresholdDays: number;
  colorHex: string;
  iconEmoji: string | null;
}

// 11 categorías canónicas (LFT 2023). isSystem=true → no eliminables.
export const ABSENCE_CATEGORY_SEED: SeedCategory[] = [
  // ── Remuneradas con saldo ────────────────────────────────────────────────
  {
    key: 'vacation',
    name: 'Vacaciones',
    description: 'Vacaciones acumuladas según LFT por antigüedad',
    isPaid: true,
    consumesBalance: true,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: 30,
    legalMinimumDays: 12,
    hrApprovalThresholdDays: 5,
    colorHex: '#14b8a6',
    iconEmoji: '🏖',
  },

  // ── Remuneradas sin saldo ────────────────────────────────────────────────
  {
    key: 'sick_leave_imss',
    name: 'Incapacidad IMSS',
    description: 'Incapacidad médica con folio IMSS',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: true,
    maxDaysPerRequest: null,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#ef4444',
    iconEmoji: '🏥',
  },
  {
    key: 'maternity_leave',
    name: 'Maternidad',
    description: 'Licencia de maternidad (LFT art. 170)',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: true,
    maxDaysPerRequest: 180,
    legalMinimumDays: 84,
    hrApprovalThresholdDays: 0,
    colorHex: '#ec4899',
    iconEmoji: '🤱',
  },
  {
    key: 'paternity_leave',
    name: 'Paternidad',
    description: 'Licencia de paternidad (5 días LFT)',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: true,
    maxDaysPerRequest: 5,
    legalMinimumDays: 5,
    hrApprovalThresholdDays: 0,
    colorHex: '#8b5cf6',
    iconEmoji: '👶',
  },
  {
    key: 'bereavement',
    name: 'Duelo',
    description: 'Permiso por fallecimiento de familiar directo',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: 5,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#6b7280',
    iconEmoji: '🕊',
  },
  {
    key: 'marriage_leave',
    name: 'Matrimonio',
    description: 'Permiso por matrimonio',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: true,
    maxDaysPerRequest: 5,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#f59e0b',
    iconEmoji: '💍',
  },
  {
    key: 'jury_duty',
    name: 'Jurado / Citatorio',
    description: 'Citatorio a jurado o autoridad',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: true,
    maxDaysPerRequest: null,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#3b82f6',
    iconEmoji: '⚖️',
  },
  {
    key: 'union_activity',
    name: 'Actividad sindical',
    description: 'Actividad sindical autorizada',
    isPaid: true,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: null,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 5,
    colorHex: '#0ea5e9',
    iconEmoji: '🤝',
  },

  // ── No remuneradas ───────────────────────────────────────────────────────
  {
    key: 'unpaid_personal_leave',
    name: 'Permiso personal sin goce',
    description: 'Permiso personal sin goce de sueldo',
    isPaid: false,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: 30,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 3,
    colorHex: '#94a3b8',
    iconEmoji: '🚪',
  },
  {
    key: 'unpaid_extended_leave',
    name: 'Licencia extendida sin goce',
    description: 'Licencia prolongada sin goce de sueldo',
    isPaid: false,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: 365,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#64748b',
    iconEmoji: '🏠',
  },

  // ── Sanciones ────────────────────────────────────────────────────────────
  {
    key: 'disciplinary_suspension',
    name: 'Suspensión disciplinaria',
    description: 'Suspensión por medida disciplinaria',
    isPaid: false,
    consumesBalance: false,
    requiresApproval: true,
    requiresCertificate: false,
    maxDaysPerRequest: 30,
    legalMinimumDays: null,
    hrApprovalThresholdDays: 0,
    colorHex: '#dc2626',
    iconEmoji: '⛔',
  },
];

export async function seedAbsenceCategoriesForOrg(orgId: string): Promise<void> {
  if (!ObjectId.isValid(orgId)) return;

  const collection = getAbsenceCategoryCollection();
  const orgObjectId = new ObjectId(orgId);
  const now = new Date();

  let created = 0;
  let updated = 0;

  for (const seed of ABSENCE_CATEGORY_SEED) {
    const baseFields: Omit<AbsenceCategoryDocument, '_id' | 'createdAt'> = {
      orgId: orgObjectId,
      key: seed.key,
      name: seed.name,
      description: seed.description,
      isPaid: seed.isPaid,
      consumesBalance: seed.consumesBalance,
      requiresApproval: seed.requiresApproval,
      requiresCertificate: seed.requiresCertificate,
      maxDaysPerRequest: seed.maxDaysPerRequest,
      legalMinimumDays: seed.legalMinimumDays,
      hrApprovalThresholdDays: seed.hrApprovalThresholdDays,
      colorHex: seed.colorHex,
      iconEmoji: seed.iconEmoji,
      isSystem: true,
      // No tocamos isActive si ya existe (la org puede haberla desactivado).
      isActive: true,
      createdBy: null,
      updatedAt: now,
      deletedAt: null,
    };

    const result = await collection.updateOne(
      { orgId: orgObjectId, key: seed.key, isSystem: true },
      {
        // Sobre actualizaciones evitamos pisar isActive — si la org la desactivó
        // mantenemos su elección.
        $set: {
          orgId: baseFields.orgId,
          name: baseFields.name,
          description: baseFields.description,
          // Reglas de negocio del catálogo del sistema: las refrescamos para
          // que siempre reflejen el seed canónico (cumplimiento LFT).
          isPaid: baseFields.isPaid,
          consumesBalance: baseFields.consumesBalance,
          requiresApproval: baseFields.requiresApproval,
          requiresCertificate: baseFields.requiresCertificate,
          maxDaysPerRequest: baseFields.maxDaysPerRequest,
          legalMinimumDays: baseFields.legalMinimumDays,
          hrApprovalThresholdDays: baseFields.hrApprovalThresholdDays,
          colorHex: baseFields.colorHex,
          iconEmoji: baseFields.iconEmoji,
          isSystem: true,
          updatedAt: now,
          deletedAt: null,
        },
        $setOnInsert: {
          key: seed.key,
          isActive: true,
          createdBy: null,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  logger.info(
    { orgId, created, updated, total: ABSENCE_CATEGORY_SEED.length },
    'Absence categories seeded for organization',
  );
}
