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
  countEmployeesWithDepartment,
  createDepartment,
  deleteDepartment,
  findDepartmentById,
  findDepartmentByKey,
  findDepartments,
  seedDepartments,
  updateDepartment,
} from './department.repository';
import { DEPARTMENT_SEED } from './department.seed';
import type {
  Department,
  DepartmentQueryFilter,
  UpdateDepartmentDto,
} from './department.types';

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
] as const satisfies readonly (keyof UpdateDepartmentDto)[];

// ── Listar ────────────────────────────────────────────────────────────────

export async function listDepartments(
  orgId:  string,
  filter: DepartmentQueryFilter,
): Promise<Department[]> {
  return findDepartments(orgId, filter);
}

// ── Crear ─────────────────────────────────────────────────────────────────

export async function createDepartmentItem(
  orgId:   string,
  actorId: string,
  data:    { name: string; key?: string },
  context: AuditContext,
): Promise<Department> {
  const key = data.key ?? slugifyKey(data.name);
  if (!key) throw new ConflictError('No se pudo generar una key válida a partir del nombre');

  const existing = await findDepartmentByKey(orgId, key);
  if (existing) {
    throw new ConflictError(`Ya existe un departamento con la key "${key}"`);
  }

  const department = await createDepartment({
    orgId,
    name:      data.name,
    key,
    isSystem:  false,
    isActive:  true,
    createdBy: actorId,
  });

  logger.info({ orgId, departmentId: department.id, key }, 'Department created');

  await emitAuditEvent({
    category: 'employees',
    action:   'department_created',
    target:   { type: 'department', id: department.id, displayName: department.name },
    metadata: { key },
    context,
  });

  return department;
}

// ── Actualizar ────────────────────────────────────────────────────────────

export async function editDepartmentItem(
  id:      string,
  orgId:   string,
  dto:     UpdateDepartmentDto,
  context: AuditContext,
): Promise<Department> {
  const existing = await findDepartmentById(id, orgId);
  if (!existing) throw new NotFoundError('Department');

  const updated = await updateDepartment(id, orgId, dto);
  if (!updated) throw new NotFoundError('Department');

  const diff = computeDiff(existing, updated, { allowedFields: UPDATABLE_FIELDS });

  if (diff) {
    await emitAuditEvent({
      category: 'employees',
      action:   'department_updated',
      target:   { type: 'department', id, displayName: updated.name },
      diff,
      context,
    });
  }

  logger.info({ id, orgId }, 'Department updated');

  return updated;
}

// ── Eliminar ──────────────────────────────────────────────────────────────

export async function removeDepartmentItem(
  id:      string,
  orgId:   string,
  context: AuditContext,
): Promise<void> {
  const existing = await findDepartmentById(id, orgId);
  if (!existing) throw new NotFoundError('Department');

  if (existing.isSystem) {
    throw new ForbiddenError('No se pueden eliminar departamentos del sistema');
  }

  const inUse = await countEmployeesWithDepartment(orgId, existing.key);
  if (inUse > 0) {
    throw new ConflictError(
      `El departamento "${existing.name}" está asignado a ${inUse} empleado(s) y no se puede eliminar`,
    );
  }

  const deleted = await deleteDepartment(id, orgId);
  if (!deleted) throw new NotFoundError('Department');

  logger.info({ id, orgId }, 'Department deleted');

  await emitAuditEvent({
    category: 'employees',
    action:   'department_deleted',
    target:   { type: 'department', id, displayName: existing.name },
    metadata: { key: existing.key },
    context,
  });
}

// ── Seed — al crear organización nueva ───────────────────────────────────

export async function initDepartmentCatalogForOrg(
  orgId:     string,
  createdBy: string,
): Promise<void> {
  await seedDepartments(orgId, createdBy, DEPARTMENT_SEED);
  logger.info(
    { orgId, total: DEPARTMENT_SEED.length },
    'Department catalog seeded for new org',
  );
}
