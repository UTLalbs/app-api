import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { buildScopeFilter } from '../../../middleware/scope';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/AppError';
import { computeDiff } from '../../../shared/utils/diff';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';
import { getUserCollection } from '../../users/user.model';
import {
  findAssignmentsByUserInRange,
  restoreAssignment,
  softDeleteAssignment,
} from '../schedules/schedule.repository';

import { findCategoryByKey } from './absence-category.repository';
import {
  getRemainingDays,
  recalculateBalance,
} from './absence-balance.service';
import {
  calcDays,
  generateHumanReadableId,
  normalizeAbsenceDate,
} from './absence.helpers';
import {
  notifyAbsenceApproved,
  notifyAbsenceHrApprovalNeeded,
  notifyAbsenceRejected,
  notifyAbsenceRequested,
} from './absence.notifications';
import {
  findActiveOnDate,
  findOverlappingRequests,
  findRequestById,
  findRequests,
  insertRequest,
  softDeleteRequest,
  toAbsenceRequest,
  updateRequest,
} from './absence.repository';
import type {
  AbsenceCategory,
  AbsenceConflictDocument,
  AbsenceRequest,
  AbsenceRequestDocument,
  AbsenceStatus,
  AssignCoverageDto,
  CheckConflictsDto,
  CreateAbsenceRequestDto,
  ListAbsenceRequestsFilter,
  UpdateAbsenceRequestDto,
} from './absence.types';

// ── Helpers internos ──────────────────────────────────────────────────────

interface EmployeeRef {
  id: string;
  displayName: string;
  position: string | null;
  managerId: string | null;
  managerName: string | null;
}

async function loadEmployeeOrThrow(
  orgId: string,
  userId: string,
): Promise<EmployeeRef> {
  if (!ObjectId.isValid(userId)) {
    throw new ValidationError('userId inválido');
  }

  const doc = await getUserCollection().findOne(
    {
      _id: new ObjectId(userId),
      orgId: new ObjectId(orgId),
      deletedAt: null,
    },
    {
      projection: {
        _id: 1,
        displayName: 1,
        'employeeProfile.isEmployee': 1,
        'employeeProfile.position': 1,
        'employeeProfile.managerId': 1,
      },
    },
  );

  if (!doc) throw new NotFoundError('Empleado');
  if (!doc.employeeProfile?.isEmployee) {
    throw new ValidationError('El usuario referenciado no es empleado');
  }

  // managerId puede venir como ObjectId (typed) o como string (data legacy).
  // Normalizamos vía new ObjectId(value) que acepta ambos.
  const rawManagerId = doc.employeeProfile?.managerId;
  let managerId: string | null = null;
  let managerName: string | null = null;
  if (rawManagerId && ObjectId.isValid(rawManagerId as string | ObjectId)) {
    const managerObjectId = new ObjectId(rawManagerId as string | ObjectId);
    managerId = managerObjectId.toHexString();
    const manager = await getUserCollection().findOne(
      { _id: managerObjectId, orgId: new ObjectId(orgId) },
      { projection: { displayName: 1 } },
    );
    managerName = manager?.displayName ?? null;
  }

  return {
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    position: doc.employeeProfile?.position ?? null,
    managerId,
    managerName,
  };
}

async function loadCategoryOrThrow(
  orgId: string,
  categoryKey: string,
): Promise<AbsenceCategory> {
  const category = await findCategoryByKey(orgId, categoryKey);
  if (!category) {
    throw new ValidationError([
      { field: 'categoryKey', message: 'Categoría inválida' },
    ]);
  }
  if (!category.isActive) {
    throw new ValidationError([
      {
        field: 'categoryKey',
        message: `La categoría "${category.name}" está desactivada`,
      },
    ]);
  }
  return category;
}

function deriveRequestedByRole(
  user: AuthenticatedUser,
  targetUserId: string,
): AbsenceRequestDocument['requestedByRole'] {
  if (user.id === targetUserId) return 'self';
  const absencesPerms = user.resolvedPermissions.absences ?? [];
  const categoryPerms = user.resolvedPermissions.absence_categories ?? [];
  if (categoryPerms.includes('update')) return 'hr_manager';
  if (absencesPerms.includes('approve')) return 'manager';
  return 'admin';
}

// ── Detección de conflictos ───────────────────────────────────────────────

interface DetectConflictsArgs {
  orgId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  category: AbsenceCategory;
  excludeId: string | null;
}

export async function detectConflicts(
  args: DetectConflictsArgs,
): Promise<AbsenceConflictDocument[]> {
  const { orgId, userId, startDate, endDate, category, excludeId } = args;
  const conflicts: AbsenceConflictDocument[] = [];
  const { totalDaysNatural, totalDaysWorking } = calcDays(startDate, endDate);

  // 1) Solapamiento con schedules ya asignados.
  const overlappingSchedules = await findAssignmentsByUserInRange(
    orgId,
    userId,
    startDate,
    endDate,
  );
  if (overlappingSchedules.length > 0) {
    conflicts.push({
      type: 'schedule_overlap',
      severity: 'warning',
      description: `${overlappingSchedules.length} turno(s) asignados en el rango. Necesitará coverage.`,
      details: {
        scheduleIds: overlappingSchedules.map((s) => s._id.toHexString()),
      },
    });
  }

  // 2) Solapamiento con otra solicitud aprobada o pendiente.
  const overlappingRequests = await findOverlappingRequests(
    orgId,
    userId,
    startDate,
    endDate,
    ['approved', 'pending'],
    excludeId,
  );
  if (overlappingRequests.length > 0) {
    conflicts.push({
      type: 'overlapping_request',
      severity: 'critical',
      description:
        overlappingRequests.length === 1
          ? 'Existe otra solicitud en el rango'
          : `Existen ${overlappingRequests.length} solicitudes en el rango`,
      details: {
        absenceIds: overlappingRequests.map((a) => a._id.toHexString()),
      },
    });
  }

  // 3) Saldo insuficiente (solo si la categoría consume balance).
  if (category.consumesBalance) {
    const year = startDate.getUTCFullYear();
    const remaining = await getRemainingDays(
      orgId,
      userId,
      year,
      category.key,
    );
    if (remaining !== null && totalDaysWorking > remaining) {
      conflicts.push({
        type: 'insufficient_balance',
        severity: 'critical',
        description: `Saldo insuficiente: ${remaining} días disponibles, ${totalDaysWorking} requeridos`,
        details: { available: remaining, requested: totalDaysWorking },
      });
    }
  }

  // 4) Excede el máximo permitido por la categoría.
  if (
    category.maxDaysPerRequest !== null &&
    totalDaysNatural > category.maxDaysPerRequest
  ) {
    conflicts.push({
      type: 'exceeds_max_days',
      severity: 'critical',
      description: `Excede el máximo de ${category.maxDaysPerRequest} días para ${category.name}`,
      details: {
        max: category.maxDaysPerRequest,
        requested: totalDaysNatural,
      },
    });
  }

  return conflicts;
}

// ── Listados ──────────────────────────────────────────────────────────────

export async function listAbsences(
  user: AuthenticatedUser,
  orgId: string,
  filter: ListAbsenceRequestsFilter,
): Promise<{ items: AbsenceRequest[]; total: number }> {
  const scopeFilter = await buildScopeFilter(
    user,
    user.permissionScope,
    'absences',
  );
  const result = await findRequests(orgId, filter, scopeFilter);
  return {
    items: result.items.map(toAbsenceRequest),
    total: result.total,
  };
}

export async function getAbsence(
  id: string,
  orgId: string,
): Promise<AbsenceRequest> {
  const doc = await findRequestById(id, orgId);
  if (!doc) throw new NotFoundError('Solicitud de ausencia');
  return toAbsenceRequest(doc);
}

export async function previewConflicts(
  orgId: string,
  dto: CheckConflictsDto,
): Promise<AbsenceConflictDocument[]> {
  const category = await loadCategoryOrThrow(orgId, dto.categoryKey);
  return detectConflicts({
    orgId,
    userId: dto.userId,
    startDate: normalizeAbsenceDate(dto.startDate),
    endDate: normalizeAbsenceDate(dto.endDate),
    category,
    excludeId: null,
  });
}

export async function listActiveOnDate(
  user: AuthenticatedUser,
  orgId: string,
  date: Date,
): Promise<AbsenceRequest[]> {
  const docs = await findActiveOnDate(orgId, normalizeAbsenceDate(date));
  // Aplicar scope manualmente (active-on no usa filter).
  const scopeFilter = await buildScopeFilter(
    user,
    user.permissionScope,
    'absences',
  );
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    const userIdFilter = (scopeFilter as { userId?: { $in?: ObjectId[] } | ObjectId })
      .userId;
    if (userIdFilter) {
      const allowed =
        userIdFilter instanceof ObjectId
          ? new Set([userIdFilter.toHexString()])
          : new Set(
              ((userIdFilter as { $in?: ObjectId[] }).$in ?? []).map((id) =>
                id.toHexString(),
              ),
            );
      return docs
        .filter((d) => allowed.has(d.userId.toHexString()))
        .map(toAbsenceRequest);
    }
  }
  return docs.map(toAbsenceRequest);
}

// ── Crear solicitud ───────────────────────────────────────────────────────

export async function registerAbsenceRequest(
  user: AuthenticatedUser,
  orgId: string,
  dto: CreateAbsenceRequestDto,
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create absence request');
  }

  const employee = await loadEmployeeOrThrow(orgId, dto.userId);
  const category = await loadCategoryOrThrow(orgId, dto.categoryKey);

  const startDate = normalizeAbsenceDate(dto.startDate);
  const endDate = normalizeAbsenceDate(dto.endDate);
  const { totalDaysNatural, totalDaysWorking } = calcDays(startDate, endDate);

  const requestedByRole = deriveRequestedByRole(user, dto.userId);

  // Solo manager / hr_manager / admin pueden registrar fechas pasadas
  // (típicamente incapacidad recibida en papel días después).
  const today = normalizeAbsenceDate(new Date());
  if (startDate < today && requestedByRole === 'self') {
    throw new ValidationError([
      {
        field: 'startDate',
        message: 'No puedes registrar una ausencia con fecha pasada',
      },
    ]);
  }

  // Categoría con maxDaysPerRequest hard-stop antes de detectar otros
  // conflicts (UX más clara).
  if (
    category.maxDaysPerRequest !== null &&
    totalDaysNatural > category.maxDaysPerRequest
  ) {
    throw new ValidationError([
      {
        field: 'endDate',
        message: `Esta categoría permite máximo ${category.maxDaysPerRequest} días por solicitud`,
      },
    ]);
  }

  const conflicts = await detectConflicts({
    orgId,
    userId: dto.userId,
    startDate,
    endDate,
    category,
    excludeId: null,
  });

  const requiresHrApproval =
    totalDaysWorking >= category.hrApprovalThresholdDays &&
    category.hrApprovalThresholdDays > 0;

  // Auto-aprobación: solo HR (con permiso categories.update) o categorías
  // que explícitamente NO requieren aprobación.
  let initialStatus: AbsenceStatus = 'pending';
  let approvalFields: Partial<AbsenceRequestDocument> = {};
  const canAutoApprove =
    user.resolvedPermissions.absences?.includes('approve') ?? false;

  if (dto.autoApprove) {
    if (!canAutoApprove) {
      throw new ForbiddenError('Sin permisos para auto-aprobar la solicitud');
    }
    initialStatus = 'approved';
    approvalFields = {
      reviewedBy: new ObjectId(user.id),
      reviewedAt: new Date(),
      reviewerNotes: 'Auto-aprobada al crear',
      hrReviewedBy: requiresHrApproval ? new ObjectId(user.id) : null,
      hrReviewedAt: requiresHrApproval ? new Date() : null,
    };
  } else if (!category.requiresApproval) {
    initialStatus = 'approved';
    approvalFields = {
      reviewedBy: new ObjectId(user.id),
      reviewedAt: new Date(),
      reviewerNotes: 'Categoría sin aprobación requerida',
    };
  }

  const newId = new ObjectId();
  const now = new Date();
  const doc: AbsenceRequestDocument = {
    _id: newId,
    orgId: new ObjectId(orgId),
    userId: new ObjectId(dto.userId),
    categoryKey: dto.categoryKey,
    startDate,
    endDate,
    totalDaysNatural,
    totalDaysWorking,
    daysConsumeFromBalance: category.consumesBalance ? totalDaysWorking : 0,
    isPartialDay: dto.isPartialDay,
    partialDayHours: dto.partialDayHours,
    status: initialStatus,
    requestedBy: new ObjectId(user.id),
    requestedByRole,
    requestedAt: now,
    reviewedBy: null,
    reviewedAt: null,
    reviewerNotes: null,
    requiresHrApproval,
    hrReviewedBy: null,
    hrReviewedAt: null,
    hrReviewerNotes: null,
    rejectionReason: null,
    rejectionCategory: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    cancellationCategory: null,
    reason: dto.reason,
    attachments: [],
    imssReference: dto.imssReference,
    certificateExpiresAt: dto.certificateExpiresAt,
    conflicts,
    coverageAssignments: [],
    llmSummary: null,
    humanReadableId: generateHumanReadableId(
      'ABS',
      startDate,
      newId.toHexString(),
    ),
    denormalizedRefs: {
      userName: employee.displayName,
      userPosition: employee.position,
      userManagerId: employee.managerId,
      userManagerName: employee.managerName,
      categoryName: category.name,
      categoryColorHex: category.colorHex,
    },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...approvalFields,
  };

  // Persistimos con _id reservado para que humanReadableId encaje.
  const persisted = await insertRequest(doc);

  // Recalcular balance si la categoría consume saldo.
  if (category.consumesBalance) {
    await recalculateBalance(orgId, dto.userId, startDate.getUTCFullYear()).catch(
      (err) =>
        logger.warn(
          { err, userId: dto.userId },
          'Failed to recalculate balance on create',
        ),
    );
  }

  // Notificaciones cuando queda 'pending'.
  if (persisted.status === 'pending') {
    await notifyAbsenceRequested(persisted, {
      id: context.actor.id,
      displayName: context.actor.displayName,
    });
  }

  await emitAuditEvent({
    category: 'absences',
    action:
      persisted.status === 'approved'
        ? 'absence_approved'
        : 'absence_requested',
    target: {
      type: 'absence_request',
      id: persisted._id.toHexString(),
      displayName: persisted.humanReadableId ?? employee.displayName,
    },
    metadata: {
      userId: dto.userId,
      categoryKey: dto.categoryKey,
      totalDaysWorking,
      conflictTypes: conflicts.map((c) => c.type),
    },
    context,
  });

  return toAbsenceRequest(persisted);
}

// ── Editar solicitud (solo en estado pending) ─────────────────────────────

const ABSENCE_UPDATABLE_FIELDS = [
  'startDate',
  'endDate',
  'reason',
  'imssReference',
  'certificateExpiresAt',
] as const satisfies readonly (keyof UpdateAbsenceRequestDto)[];

export async function editAbsenceRequest(
  id: string,
  orgId: string,
  dto: UpdateAbsenceRequestDto,
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to update absence request');
  }
  const existing = await findRequestById(id, orgId);
  if (!existing) throw new NotFoundError('Solicitud de ausencia');

  if (existing.status !== 'pending') {
    throw new ConflictError(
      'Solo se pueden editar solicitudes en estado pendiente',
    );
  }

  const set: Partial<AbsenceRequestDocument> = {};

  if (dto.startDate !== undefined) {
    set.startDate = normalizeAbsenceDate(dto.startDate);
  }
  if (dto.endDate !== undefined) {
    set.endDate = normalizeAbsenceDate(dto.endDate);
  }

  if (set.startDate || set.endDate) {
    const startDate = set.startDate ?? existing.startDate;
    const endDate = set.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new ValidationError([
        { field: 'endDate', message: 'endDate debe ser >= startDate' },
      ]);
    }
    const { totalDaysNatural, totalDaysWorking } = calcDays(
      startDate,
      endDate,
    );
    set.totalDaysNatural = totalDaysNatural;
    set.totalDaysWorking = totalDaysWorking;

    const category = await loadCategoryOrThrow(orgId, existing.categoryKey);
    set.daysConsumeFromBalance = category.consumesBalance
      ? totalDaysWorking
      : 0;
    set.requiresHrApproval =
      totalDaysWorking >= category.hrApprovalThresholdDays &&
      category.hrApprovalThresholdDays > 0;
    set.conflicts = await detectConflicts({
      orgId,
      userId: existing.userId.toHexString(),
      startDate,
      endDate,
      category,
      excludeId: id,
    });
  }

  if (dto.reason !== undefined) set.reason = dto.reason;
  if (dto.imssReference !== undefined) set.imssReference = dto.imssReference;
  if (dto.certificateExpiresAt !== undefined) {
    set.certificateExpiresAt = dto.certificateExpiresAt;
  }

  const updated = await updateRequest(id, orgId, set);
  if (!updated) throw new NotFoundError('Solicitud de ausencia');

  const diff = computeDiff(
    {
      startDate: existing.startDate,
      endDate: existing.endDate,
      reason: existing.reason,
      imssReference: existing.imssReference,
      certificateExpiresAt: existing.certificateExpiresAt,
    },
    {
      startDate: updated.startDate,
      endDate: updated.endDate,
      reason: updated.reason,
      imssReference: updated.imssReference,
      certificateExpiresAt: updated.certificateExpiresAt,
    },
    { allowedFields: ABSENCE_UPDATABLE_FIELDS },
  );
  if (diff) {
    await emitAuditEvent({
      category: 'absences',
      action: 'absence_updated',
      target: {
        type: 'absence_request',
        id,
        displayName: updated.humanReadableId ?? existing.denormalizedRefs.userName,
      },
      diff,
      context,
    });
  }

  return toAbsenceRequest(updated);
}

// ── Aprobar ───────────────────────────────────────────────────────────────

export async function approveAbsence(
  user: AuthenticatedUser,
  id: string,
  orgId: string,
  notes: string | null,
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to approve absence');
  }
  const existing = await findRequestById(id, orgId);
  if (!existing) throw new NotFoundError('Solicitud de ausencia');
  if (existing.status !== 'pending') {
    throw new ConflictError(
      `No se puede aprobar una solicitud en estado ${existing.status}`,
    );
  }

  const isHrManager =
    user.resolvedPermissions.absence_categories?.includes('update') ?? false;
  const isDirectManager =
    existing.denormalizedRefs.userManagerId === user.id;

  const set: Partial<AbsenceRequestDocument> = {};
  let finalStatus: AbsenceStatus = existing.status;

  if (existing.requiresHrApproval) {
    // Doble aprobación: manager primero, HR después.
    if (!existing.reviewedBy && isDirectManager) {
      // Primera aprobación (manager directo).
      set.reviewedBy = new ObjectId(user.id);
      set.reviewedAt = new Date();
      set.reviewerNotes = notes;
    } else if (isHrManager) {
      // Aprobación final HR (puede ser primera o segunda según el caso).
      set.hrReviewedBy = new ObjectId(user.id);
      set.hrReviewedAt = new Date();
      set.hrReviewerNotes = notes;
      // Si nunca pasó por manager directo, marcarlo como override.
      if (!existing.reviewedBy) {
        set.reviewedBy = new ObjectId(user.id);
        set.reviewedAt = new Date();
        set.reviewerNotes =
          notes ?? 'Aprobación directa de HR (sin manager directo)';
      }
      set.status = 'approved';
      finalStatus = 'approved';
    } else {
      throw new ForbiddenError(
        'Esta solicitud requiere aprobación HR para finalizarse',
      );
    }
  } else {
    // Aprobación simple.
    set.reviewedBy = new ObjectId(user.id);
    set.reviewedAt = new Date();
    set.reviewerNotes = notes;
    set.status = 'approved';
    finalStatus = 'approved';
  }

  const updated = await updateRequest(id, orgId, set);
  if (!updated) throw new NotFoundError('Solicitud de ausencia');

  // Side-effects al pasar a 'approved'.
  if (finalStatus === 'approved') {
    // Soft-delete de los turnos que caen dentro del rango: el empleado no
    // estará disponible esos días y el calendario debe reflejarlo. Quedan
    // registrados en coverageAssignments (status 'cancelled') para auditoría
    // y eventual restauración manual si se cancela la ausencia.
    const affected = await findAssignmentsByUserInRange(
      orgId,
      updated.userId.toHexString(),
      updated.startDate,
      updated.endDate,
    );
    if (affected.length > 0) {
      const now = new Date();
      const coverageAssignments = affected.map((s) => ({
        scheduleId: s._id,
        workDate: s.workDate,
        status: 'cancelled' as const,
        coveringUserId: null,
        resolvedAt: now,
      }));
      // Borrar los schedules en paralelo. softDeleteAssignment es idempotente
      // (no error si ya estaba borrado).
      await Promise.all(
        affected.map((s) =>
          softDeleteAssignment(s._id.toHexString(), orgId).catch((err) =>
            logger.warn(
              { err, scheduleId: s._id.toHexString() },
              'Failed to soft-delete schedule on absence approval',
            ),
          ),
        ),
      );
      await updateRequest(id, orgId, { coverageAssignments });

      // Audit por cada turno borrado para trazabilidad.
      await Promise.all(
        affected.map((s) =>
          emitAuditEvent({
            category: 'schedules',
            action: 'schedule_deleted',
            target: {
              type: 'schedule_assignment',
              id: s._id.toHexString(),
              displayName:
                s.denormalizedRefs.userName ?? s._id.toHexString(),
            },
            metadata: {
              reason: 'auto_deleted_by_absence_approval',
              absenceId: id,
              workDate: s.workDate.toISOString().slice(0, 10),
            },
            context,
          }),
        ),
      );
    }

    // Recalcular balance si aplica.
    const category = await findCategoryByKey(orgId, updated.categoryKey);
    if (category?.consumesBalance) {
      await recalculateBalance(
        orgId,
        updated.userId.toHexString(),
        updated.startDate.getUTCFullYear(),
      ).catch((err) =>
        logger.warn(
          { err, userId: updated.userId.toHexString() },
          'Failed to recalculate balance on approve',
        ),
      );
    }

    // Notificación al empleado.
    await notifyAbsenceApproved(updated, {
      id: context.actor.id,
      displayName: context.actor.displayName,
    });
  } else {
    // Quedó en pending pero ya fue revisada por manager — notificar HR.
    await notifyAbsenceHrApprovalNeeded(updated, {
      id: context.actor.id,
      displayName: context.actor.displayName,
    });
  }

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_approved',
    target: {
      type: 'absence_request',
      id,
      displayName:
        updated.humanReadableId ?? existing.denormalizedRefs.userName,
    },
    metadata: {
      finalStatus,
      requiresHrApproval: existing.requiresHrApproval,
    },
    context,
  });

  return toAbsenceRequest(updated);
}

// ── Rechazar ──────────────────────────────────────────────────────────────

export async function rejectAbsence(
  user: AuthenticatedUser,
  id: string,
  orgId: string,
  payload: {
    rejectionCategory: import('./absence.types').RejectionCategory;
    rejectionReason: string;
    notes: string | null;
  },
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to reject absence');
  }
  void user;
  const existing = await findRequestById(id, orgId);
  if (!existing) throw new NotFoundError('Solicitud de ausencia');
  if (existing.status !== 'pending') {
    throw new ConflictError(
      `No se puede rechazar una solicitud en estado ${existing.status}`,
    );
  }

  const updated = await updateRequest(id, orgId, {
    status: 'rejected',
    rejectionCategory: payload.rejectionCategory,
    rejectionReason: payload.rejectionReason,
    reviewedBy: new ObjectId(context.actor.id),
    reviewedAt: new Date(),
    reviewerNotes: payload.notes,
  });
  if (!updated) throw new NotFoundError('Solicitud de ausencia');

  await notifyAbsenceRejected(updated, {
    id: context.actor.id,
    displayName: context.actor.displayName,
  });

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_rejected',
    target: {
      type: 'absence_request',
      id,
      displayName:
        updated.humanReadableId ?? existing.denormalizedRefs.userName,
    },
    metadata: {
      rejectionCategory: payload.rejectionCategory,
      rejectionReason: payload.rejectionReason,
    },
    context,
  });

  return toAbsenceRequest(updated);
}

// ── Cancelar ──────────────────────────────────────────────────────────────

export async function cancelAbsence(
  user: AuthenticatedUser,
  id: string,
  orgId: string,
  payload: {
    cancellationCategory: import('./absence.types').CancellationCategory;
    cancellationReason: string | null;
  },
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to cancel absence');
  }
  const existing = await findRequestById(id, orgId);
  if (!existing) throw new NotFoundError('Solicitud de ausencia');
  if (existing.status === 'cancelled' || existing.status === 'rejected') {
    throw new ConflictError(
      `La solicitud ya está en estado ${existing.status}`,
    );
  }

  // Empleado regular solo puede cancelar sus propias solicitudes.
  const isOwner = existing.userId.toHexString() === user.id;
  const canManage =
    user.resolvedPermissions.absences?.includes('cancel') ?? false;
  if (!isOwner && !canManage) {
    throw new ForbiddenError('Sin permisos para cancelar esta solicitud');
  }

  const updated = await updateRequest(id, orgId, {
    status: 'cancelled',
    cancelledBy: new ObjectId(context.actor.id),
    cancelledAt: new Date(),
    cancellationCategory: payload.cancellationCategory,
    cancellationReason: payload.cancellationReason,
  });
  if (!updated) throw new NotFoundError('Solicitud de ausencia');

  // Si la ausencia estaba aprobada, restaurar los turnos que habíamos
  // borrado al aprobarla. Cada uno está registrado en coverageAssignments
  // con status 'cancelled' (lo guardamos justamente para poder revertir).
  let restoredCount = 0;
  if (
    existing.status === 'approved' &&
    existing.coverageAssignments.length > 0
  ) {
    const toRestore = existing.coverageAssignments.filter(
      (ca) => ca.status === 'cancelled',
    );
    if (toRestore.length > 0) {
      const results = await Promise.all(
        toRestore.map((ca) =>
          restoreAssignment(ca.scheduleId.toHexString(), orgId).catch(
            (err) => {
              logger.warn(
                { err, scheduleId: ca.scheduleId.toHexString() },
                'Failed to restore schedule on absence cancel',
              );
              return false;
            },
          ),
        ),
      );
      restoredCount = results.filter(Boolean).length;

      // Audit por cada turno restaurado para trazabilidad.
      await Promise.all(
        toRestore.map((ca) =>
          emitAuditEvent({
            category: 'schedules',
            action: 'schedule_updated',
            target: {
              type: 'schedule_assignment',
              id: ca.scheduleId.toHexString(),
              displayName:
                existing.denormalizedRefs.userName +
                ' · ' +
                ca.workDate.toISOString().slice(0, 10),
            },
            metadata: {
              reason: 'restored_by_absence_cancel',
              absenceId: id,
              workDate: ca.workDate.toISOString().slice(0, 10),
            },
            context,
          }),
        ),
      );

      // Marcar coverageAssignments como `unresolved` (vuelven a estar vigentes).
      const refreshed = updated.coverageAssignments.map((ca) =>
        ca.status === 'cancelled'
          ? { ...ca, status: 'unresolved' as const, resolvedAt: null }
          : ca,
      );
      await updateRequest(id, orgId, { coverageAssignments: refreshed });
    }
  }

  // Si liberó saldo, recalcular.
  const category = await findCategoryByKey(orgId, updated.categoryKey);
  if (category?.consumesBalance) {
    await recalculateBalance(
      orgId,
      updated.userId.toHexString(),
      updated.startDate.getUTCFullYear(),
    ).catch((err) =>
      logger.warn(
        { err, userId: updated.userId.toHexString() },
        'Failed to recalculate balance on cancel',
      ),
    );
  }

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_cancelled',
    target: {
      type: 'absence_request',
      id,
      displayName:
        updated.humanReadableId ?? existing.denormalizedRefs.userName,
    },
    metadata: {
      cancellationCategory: payload.cancellationCategory,
      cancellationReason: payload.cancellationReason,
      prevStatus: existing.status,
      restoredScheduleCount: restoredCount,
    },
    context,
  });

  return toAbsenceRequest(updated);
}

// ── Coverage assignments ──────────────────────────────────────────────────

export async function assignCoverage(
  id: string,
  orgId: string,
  dto: AssignCoverageDto,
  context: AuditContext,
): Promise<AbsenceRequest> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to assign coverage');
  }
  const existing = await findRequestById(id, orgId);
  if (!existing) throw new NotFoundError('Solicitud de ausencia');
  if (existing.status !== 'approved') {
    throw new ConflictError(
      'Solo se puede asignar coverage a solicitudes aprobadas',
    );
  }

  const byScheduleId = new Map<string, (typeof dto.assignments)[number]>();
  for (const a of dto.assignments) {
    byScheduleId.set(a.scheduleId, a);
  }

  const next = existing.coverageAssignments.map((ca) => {
    const update = byScheduleId.get(ca.scheduleId.toHexString());
    if (!update) return ca;
    return {
      ...ca,
      status: update.status,
      coveringUserId: update.coveringUserId
        ? new ObjectId(update.coveringUserId)
        : null,
      resolvedAt:
        update.status === 'unresolved' ? null : new Date(),
    };
  });

  const updated = await updateRequest(id, orgId, {
    coverageAssignments: next,
  });
  if (!updated) throw new NotFoundError('Solicitud de ausencia');

  await emitAuditEvent({
    category: 'absences',
    action: 'absence_coverage_assigned',
    target: {
      type: 'absence_request',
      id,
      displayName:
        updated.humanReadableId ?? existing.denormalizedRefs.userName,
    },
    metadata: { assignmentCount: dto.assignments.length },
    context,
  });

  return toAbsenceRequest(updated);
}

// ── Eliminar (solo dev/admin) ─────────────────────────────────────────────

export async function removeAbsence(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<void> {
  void context;
  const ok = await softDeleteRequest(id, orgId);
  if (!ok) throw new NotFoundError('Solicitud de ausencia');
}
