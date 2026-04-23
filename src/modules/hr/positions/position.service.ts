import { logger } from '../../../config/logger';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors/AppError';
import { computeDiff } from '../../../shared/utils/diff';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';

import {
  countEmployeesWithPosition,
  createPosition,
  deletePosition,
  findPositionById,
  findPositionByKey,
  findPositions,
  seedPositions,
  updatePosition,
} from './position.repository';
import { POSITION_SEED } from './position.seed';
import type {
  Position,
  PositionQueryFilter,
  UpdatePositionDto,
} from './position.types';

// Genera `key` snake_case desde un `name`: "Operador Fronterizo" → "operador_fronterizo".
function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const UPDATABLE_FIELDS = [
  'name',
  'isActive',
] as const satisfies readonly (keyof UpdatePositionDto)[];

// ── Listar ────────────────────────────────────────────────────────────────

export async function listPositions(
  orgId:  string,
  filter: PositionQueryFilter,
): Promise<Position[]> {
  return findPositions(orgId, filter);
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function createPositionItem(
  orgId:   string,
  actorId: string,
  data:    { name: string; key?: string },
  context: AuditContext,
): Promise<Position> {
  const key = data.key ?? slugifyKey(data.name);
  if (!key) throw new ConflictError('No se pudo generar una key válida a partir del nombre');

  const existing = await findPositionByKey(orgId, key);
  if (existing) {
    throw new ConflictError(`Ya existe un puesto con la key "${key}"`);
  }

  const position = await createPosition({
    orgId,
    name:      data.name,
    key,
    isSystem:  false,
    isActive:  true,
    createdBy: actorId,
  });

  logger.info({ orgId, positionId: position.id, key }, 'Position created');

  await emitAuditEvent({
    category: 'employees',
    action:   'position_created',
    target:   { type: 'position', id: position.id, displayName: position.name },
    metadata: { key },
    context,
  });

  return position;
}

// ── Actualizar ────────────────────────────────────────────────────────────

export async function editPositionItem(
  id:      string,
  orgId:   string,
  dto:     UpdatePositionDto,
  context: AuditContext,
): Promise<Position> {
  const existing = await findPositionById(id, orgId);
  if (!existing) throw new NotFoundError('Position');

  const updated = await updatePosition(id, orgId, dto);
  if (!updated) throw new NotFoundError('Position');

  const diff = computeDiff(existing, updated, { allowedFields: UPDATABLE_FIELDS });

  if (diff) {
    await emitAuditEvent({
      category: 'employees',
      action:   'position_updated',
      target:   { type: 'position', id, displayName: updated.name },
      diff,
      context,
    });
  }

  logger.info({ id, orgId }, 'Position updated');

  return updated;
}

// ── Eliminar ──────────────────────────────────────────────────────────────

export async function removePositionItem(
  id:      string,
  orgId:   string,
  context: AuditContext,
): Promise<void> {
  const existing = await findPositionById(id, orgId);
  if (!existing) throw new NotFoundError('Position');

  if (existing.isSystem) {
    throw new ForbiddenError('No se pueden eliminar puestos del sistema');
  }

  const inUse = await countEmployeesWithPosition(orgId, existing.key);
  if (inUse > 0) {
    throw new ConflictError(
      `El puesto "${existing.name}" está asignado a ${inUse} empleado(s) y no se puede eliminar`,
    );
  }

  const deleted = await deletePosition(id, orgId);
  if (!deleted) throw new NotFoundError('Position');

  logger.info({ id, orgId }, 'Position deleted');

  await emitAuditEvent({
    category: 'employees',
    action:   'position_deleted',
    target:   { type: 'position', id, displayName: existing.name },
    metadata: { key: existing.key },
    context,
  });
}

// ── Seed — al crear organización nueva ───────────────────────────────────

export async function initPositionCatalogForOrg(
  orgId:     string,
  createdBy: string,
): Promise<void> {
  await seedPositions(orgId, createdBy, POSITION_SEED);
  logger.info(
    { orgId, total: POSITION_SEED.length },
    'Position catalog seeded for new org',
  );
}
