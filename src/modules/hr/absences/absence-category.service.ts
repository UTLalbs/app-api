import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/AppError';
import { computeDiff } from '../../../shared/utils/diff';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';

import {
  createCategory,
  findCategories,
  findCategoryById,
  findCategoryByKey,
  softDeleteCategory,
  updateCategory,
} from './absence-category.repository';
import type {
  AbsenceCategory,
  CreateAbsenceCategoryDto,
  UpdateAbsenceCategoryDto,
} from './absence.types';

const KEY_FROM_NAME = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);

const CATEGORY_UPDATABLE_FIELDS = [
  'name',
  'description',
  'isPaid',
  'consumesBalance',
  'requiresApproval',
  'requiresCertificate',
  'maxDaysPerRequest',
  'legalMinimumDays',
  'hrApprovalThresholdDays',
  'colorHex',
  'iconEmoji',
  'isActive',
] as const satisfies readonly (keyof UpdateAbsenceCategoryDto)[];

export async function listCategories(
  orgId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<AbsenceCategory[]> {
  return findCategories(orgId, opts);
}

export async function getCategory(
  id: string,
  orgId: string,
): Promise<AbsenceCategory> {
  const cat = await findCategoryById(id, orgId);
  if (!cat) throw new NotFoundError('Categoría de ausencia');
  return cat;
}

export async function registerCategory(
  orgId: string,
  dto: CreateAbsenceCategoryDto,
  context: AuditContext,
): Promise<AbsenceCategory> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create absence category');
  }
  if (!dto.name?.trim()) throw new ValidationError('name es requerido');

  const key = (dto.key ?? KEY_FROM_NAME(dto.name)).trim();
  if (!key) {
    throw new ValidationError([
      { field: 'key', message: 'No se pudo derivar key desde el nombre' },
    ]);
  }

  const existing = await findCategoryByKey(orgId, key);
  if (existing) {
    throw new ConflictError(`Ya existe una categoría con key "${key}"`);
  }

  const created = await createCategory({
    ...dto,
    orgId,
    key,
    isSystem: false,
    createdBy: context.actor.id,
  });

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_category_created',
    target: {
      type: 'absence_category',
      id: created.id,
      displayName: created.name,
    },
    metadata: { key: created.key, isPaid: created.isPaid },
    context,
  });

  return created;
}

export async function editCategory(
  id: string,
  orgId: string,
  dto: UpdateAbsenceCategoryDto,
  context: AuditContext,
): Promise<AbsenceCategory> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to update absence category');
  }
  const existing = await findCategoryById(id, orgId);
  if (!existing) throw new NotFoundError('Categoría de ausencia');

  // Las categorías del sistema solo pueden cambiar isActive y aspectos
  // visuales (colorHex, iconEmoji). Las reglas (consumesBalance, isPaid,
  // requiresApproval, etc.) están fijadas por LFT y no son editables.
  if (existing.isSystem) {
    const protectedKeys: (keyof UpdateAbsenceCategoryDto)[] = [
      'isPaid',
      'consumesBalance',
      'requiresApproval',
      'requiresCertificate',
      'maxDaysPerRequest',
      'legalMinimumDays',
    ];
    for (const k of protectedKeys) {
      if (dto[k] !== undefined && dto[k] !== existing[k]) {
        throw new ForbiddenError(
          `No se puede modificar "${k}" en categorías del sistema`,
        );
      }
    }
  }

  const updated = await updateCategory(id, orgId, dto);
  if (!updated) throw new NotFoundError('Categoría de ausencia');

  const diff = computeDiff(existing, updated, {
    allowedFields: CATEGORY_UPDATABLE_FIELDS,
  });
  if (diff) {
    await emitAuditEvent({
      category: 'absences',
      action: 'absence_category_updated',
      target: {
        type: 'absence_category',
        id,
        displayName: updated.name,
      },
      diff,
      context,
    });
  }

  return updated;
}

export async function removeCategory(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<void> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to delete absence category');
  }
  const existing = await findCategoryById(id, orgId);
  if (!existing) throw new NotFoundError('Categoría de ausencia');
  if (existing.isSystem) {
    throw new ForbiddenError('No se pueden eliminar categorías del sistema');
  }

  const ok = await softDeleteCategory(id, orgId);
  if (!ok) throw new NotFoundError('Categoría de ausencia');

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_category_deleted',
    target: {
      type: 'absence_category',
      id,
      displayName: existing.name,
    },
    context,
  });
}
