import { ObjectId } from 'mongodb';

import { logger } from '../../../config/logger';
import { buildScopeFilter } from '../../../middleware/scope';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/AppError';
import { computeDiff } from '../../../shared/utils/diff';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { emitAuditEvent } from '../../audit/audit.service';
import type { AuditContext } from '../../audit/audit.types';
import { getLocationCollection } from '../../locations/location.model';
import { getUserCollection } from '../../users/user.model';

import {
  calcAssignmentMinutes,
  calcOvertimeForWeek,
  calcPeriodMinutes,
  calcServiceMinutes,
  normalizeWorkDate,
  parseTime,
  validateCommitmentsInsidePeriod,
  validatePeriodTimes,
} from './schedule.helpers';
import {
  createAssignment,
  createTemplate,
  findAssignmentById,
  findAssignments,
  findAssignmentsByUserAndDate,
  findAssignmentsByUserInRange,
  findTemplateById,
  findTemplates,
  softDeleteAssignment,
  softDeleteTemplate,
  toSchedule,
  toScheduleTemplate,
  updateAssignment as updateAssignmentDoc,
  updateTemplate as updateTemplateDoc,
} from './schedule.repository';
import type {
  CreateAssignmentDto,
  CreateTemplateDto,
  ListAssignmentsFilter,
  ListTemplatesFilter,
  Schedule,
  ScheduleAssignmentDocument,
  ScheduleConflict,
  ScheduleTemplate,
  UpdateAssignmentDto,
  UpdateTemplateDto,
  WorkPeriodDto,
} from './schedule.types';

// ── Helpers de validación de referencias ──────────────────────────────────

interface EmployeeRef {
  id: string;
  displayName: string;
  position: string | null;
  department: string | null;
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
        'employeeProfile.department': 1,
      },
    },
  );

  if (!doc) throw new NotFoundError('Empleado');
  if (!doc.employeeProfile?.isEmployee) {
    throw new ValidationError('El usuario referenciado no es empleado');
  }

  return {
    id: doc._id.toHexString(),
    displayName: doc.displayName,
    position: doc.employeeProfile?.position ?? null,
    department: doc.employeeProfile?.department ?? null,
  };
}

async function validateLocationsExist(
  orgId: string,
  locationIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(locationIds)].filter((id) => ObjectId.isValid(id));
  if (uniqueIds.length === 0) return new Map();

  const docs = await getLocationCollection()
    .find(
      {
        _id: { $in: uniqueIds.map((id) => new ObjectId(id)) },
        orgId: new ObjectId(orgId),
        deletedAt: null,
      },
      { projection: { _id: 1, name: 1, isActive: 1 } },
    )
    .toArray();

  const found = new Map<string, string>();
  for (const d of docs) {
    found.set(d._id.toHexString(), d.name);
  }

  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ValidationError([
      {
        field: 'locationId',
        message: `Ubicaciones no encontradas o inactivas: ${missing.join(', ')}`,
      },
    ]);
  }

  return found;
}

function collectLocationIds(periods: WorkPeriodDto[]): string[] {
  const ids: string[] = [];
  for (const p of periods) {
    ids.push(p.startLocationId, p.endLocationId);
    for (const sc of p.serviceCommitments) ids.push(sc.locationId);
  }
  return ids;
}

// ── Detección de conflictos ───────────────────────────────────────────────

interface DetectConflictsArgs {
  orgId: string;
  userId: string;
  workDate: Date;
  periods: WorkPeriodDto[];
  excludeAssignmentId: string | null;
}

async function detectConflicts(
  args: DetectConflictsArgs,
): Promise<ScheduleConflict[]> {
  const { orgId, userId, workDate, periods, excludeAssignmentId } = args;
  const conflicts: ScheduleConflict[] = [];

  // 1) Double booking: ya existe otro assignment en la misma fecha.
  const sameDay = await findAssignmentsByUserAndDate(
    orgId,
    userId,
    workDate,
    excludeAssignmentId,
  );
  if (sameDay.length > 0) {
    conflicts.push({
      type: 'double_booking',
      severity: 'warning',
      description: 'Ya existe otra asignación para este día',
      affectedPeriodId: null,
      details: {
        existingIds: sameDay.map((a) => a._id.toHexString()),
      },
    });
  }

  // 2) OT semanal LFT: suma esta semana + nuevo turno.
  const weekStart = new Date(workDate);
  const dayOfWeek = weekStart.getUTCDay(); // 0=Sun, 1=Mon ...
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setUTCDate(weekStart.getUTCDate() + offsetToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const weekAssignments = await findAssignmentsByUserInRange(
    orgId,
    userId,
    weekStart,
    weekEnd,
    excludeAssignmentId,
  );

  const existingMinutes = weekAssignments.reduce(
    (sum, a) => sum + calcAssignmentMinutes(a),
    0,
  );
  const newMinutes = periods.reduce((sum, p) => sum + calcPeriodMinutes(p), 0);
  const totalWeekMinutes = existingMinutes + newMinutes;

  if (totalWeekMinutes > 48 * 60) {
    const ot = calcOvertimeForWeek(totalWeekMinutes);
    conflicts.push({
      type: 'weekly_overtime',
      severity: ot.ot200 > 0 ? 'critical' : 'warning',
      description: `Esta semana acumularía ${(totalWeekMinutes / 60).toFixed(1)}h, excede 48h LFT`,
      affectedPeriodId: null,
      details: {
        totalMinutes: totalWeekMinutes,
        regularMinutes: ot.regular,
        ot100Minutes: ot.ot100,
        ot200Minutes: ot.ot200,
      },
    });
  }

  // 3) Descanso entre jornadas: <11h entre fin del turno previo y inicio del nuevo.
  if (periods.length > 0) {
    const newStart = parseTime(periods[0].startTime);
    const prevDate = new Date(workDate);
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const prevAssignments = await findAssignmentsByUserAndDate(
      orgId,
      userId,
      prevDate,
      excludeAssignmentId,
    );
    for (const prev of prevAssignments) {
      for (const prevPeriod of prev.periods) {
        const prevEnd = prevPeriod.multiDay
          ? prevPeriod.endDayOffset * 1440 + parseTime(prevPeriod.endTime)
          : parseTime(prevPeriod.endTime);
        // Convertir a "minutos desde medianoche del nuevo día"
        const prevEndOnNewDay = prevEnd - 1440;
        const restMinutes = newStart - prevEndOnNewDay;
        if (restMinutes < 11 * 60) {
          conflicts.push({
            type: 'rest_violation',
            severity: 'warning',
            description: `Descanso entre jornadas menor a 11h (${(restMinutes / 60).toFixed(1)}h)`,
            affectedPeriodId: null,
            details: {
              previousAssignmentId: prev._id.toHexString(),
              restMinutes,
            },
          });
        }
      }
    }
  }

  // 4) TODO(absences-module): cuando exista el módulo absences, validar overlap aquí.
  //    const overlapping = await absencesRepo.findOverlapping(orgId, userId, workDate);
  //    if (overlapping.length > 0) {
  //      conflicts.push({ type: 'absence_overlap', severity: 'critical', ... });
  //    }

  return conflicts;
}

// ── Mapeo a Schedule con datos calculados ─────────────────────────────────

async function buildScheduleResponse(
  doc: ScheduleAssignmentDocument,
  conflicts: ScheduleConflict[] = [],
): Promise<Schedule> {
  // Resolver nombres de ubicaciones referenciadas para enriquecer la respuesta.
  const locationIds = new Set<string>();
  for (const p of doc.periods) {
    locationIds.add(p.startLocationId.toHexString());
    locationIds.add(p.endLocationId.toHexString());
    for (const sc of p.serviceCommitments) {
      locationIds.add(sc.locationId.toHexString());
    }
  }

  const locationNames = new Map<string, string>();
  if (locationIds.size > 0) {
    const docs = await getLocationCollection()
      .find(
        {
          _id: { $in: [...locationIds].map((id) => new ObjectId(id)) },
          orgId: doc.orgId,
        },
        { projection: { _id: 1, name: 1 } },
      )
      .toArray();
    for (const d of docs) {
      locationNames.set(d._id.toHexString(), d.name);
    }
  }

  const schedule = toSchedule(doc, locationNames);
  schedule.totalMinutes = doc.periods.reduce(
    (sum, p) => sum + calcPeriodMinutes(p),
    0,
  );
  schedule.serviceMinutes = doc.periods.reduce(
    (sum, p) => sum + calcServiceMinutes(p),
    0,
  );
  schedule.conflicts = conflicts;
  return schedule;
}

// ── TEMPLATES — service ───────────────────────────────────────────────────

export async function listTemplates(
  user: AuthenticatedUser,
  orgId: string,
  rawFilter: { isActive?: 'true' | 'false'; shiftType?: ScheduleTemplate['shiftType'] },
): Promise<ScheduleTemplate[]> {
  const filter: ListTemplatesFilter = {
    isActive:
      rawFilter.isActive === 'true'
        ? true
        : rawFilter.isActive === 'false'
          ? false
          : undefined,
    shiftType: rawFilter.shiftType,
  };

  // Acceder a templates no requiere scope (son catálogo de la org).
  void user;
  return findTemplates(orgId, filter);
}

export async function getTemplate(
  id: string,
  orgId: string,
): Promise<ScheduleTemplate> {
  const tpl = await findTemplateById(id, orgId);
  if (!tpl) throw new NotFoundError('Schedule template');
  return tpl;
}

export async function registerTemplate(
  orgId: string,
  dto: CreateTemplateDto,
  context: AuditContext,
): Promise<ScheduleTemplate> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create schedule template');
  }
  if (!dto.name?.trim()) throw new ValidationError('name es requerido');

  parseTime(dto.defaultStartTime);
  parseTime(dto.defaultEndTime);

  const locIds = [
    ...(dto.defaultStartLocationId ? [dto.defaultStartLocationId] : []),
    ...(dto.defaultEndLocationId ? [dto.defaultEndLocationId] : []),
    ...dto.defaultServiceCommitments.map((sc) => sc.locationId),
  ];
  if (locIds.length > 0) await validateLocationsExist(orgId, locIds);

  const tpl = await createTemplate({
    ...dto,
    orgId,
    createdBy: context.actor.id,
  });

  await emitAuditEvent({
    category: 'schedules',
    action: 'template_created',
    target: { type: 'schedule_template', id: tpl.id, displayName: tpl.name },
    metadata: { shiftType: tpl.shiftType },
    context,
  });

  return tpl;
}

const TEMPLATE_UPDATABLE_FIELDS = [
  'name',
  'description',
  'shiftType',
  'defaultStartTime',
  'defaultEndTime',
  'defaultStartLocationId',
  'defaultEndLocationId',
  'defaultServiceCommitments',
  'applyAutoBreak',
  'breakDurationMinutes',
  'colorHex',
  'isActive',
] as const satisfies readonly (keyof UpdateTemplateDto)[];

export async function editTemplate(
  id: string,
  orgId: string,
  dto: UpdateTemplateDto,
  context: AuditContext,
): Promise<ScheduleTemplate> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to update schedule template');
  }

  const existing = await findTemplateById(id, orgId);
  if (!existing) throw new NotFoundError('Schedule template');

  if (existing.isSystem) {
    throw new ForbiddenError(
      'No se pueden editar plantillas del sistema',
    );
  }

  if (dto.defaultStartTime) parseTime(dto.defaultStartTime);
  if (dto.defaultEndTime) parseTime(dto.defaultEndTime);

  const locIds: string[] = [];
  if (dto.defaultStartLocationId) locIds.push(dto.defaultStartLocationId);
  if (dto.defaultEndLocationId) locIds.push(dto.defaultEndLocationId);
  if (dto.defaultServiceCommitments) {
    locIds.push(...dto.defaultServiceCommitments.map((sc) => sc.locationId));
  }
  if (locIds.length > 0) await validateLocationsExist(orgId, locIds);

  const updated = await updateTemplateDoc(id, orgId, {
    ...dto,
    updatedBy: context.actor.id,
  });
  if (!updated) throw new NotFoundError('Schedule template');

  const diff = computeDiff(existing, updated, {
    allowedFields: TEMPLATE_UPDATABLE_FIELDS,
  });
  if (diff) {
    await emitAuditEvent({
      category: 'schedules',
      action: 'template_updated',
      target: {
        type: 'schedule_template',
        id,
        displayName: updated.name,
      },
      diff,
      context,
    });
  }

  return updated;
}

export async function removeTemplate(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<void> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to delete schedule template');
  }

  const existing = await findTemplateById(id, orgId);
  if (!existing) throw new NotFoundError('Schedule template');

  if (existing.isSystem) {
    throw new ForbiddenError('No se pueden eliminar plantillas del sistema');
  }

  const ok = await softDeleteTemplate(id, orgId);
  if (!ok) throw new NotFoundError('Schedule template');

  await emitAuditEvent({
    category: 'schedules',
    action: 'template_deleted',
    target: { type: 'schedule_template', id, displayName: existing.name },
    context,
  });
}

// ── ASSIGNMENTS — service ─────────────────────────────────────────────────

export async function listAssignments(
  user: AuthenticatedUser,
  orgId: string,
  filter: ListAssignmentsFilter,
): Promise<Schedule[]> {
  const scopeFilter = await buildScopeFilter(
    user,
    user.permissionScope,
    'schedules',
  );

  const docs = await findAssignments(orgId, filter, scopeFilter);

  // Resolver nombres de ubicaciones de TODOS los assignments en una sola query.
  const locIds = new Set<string>();
  for (const d of docs) {
    for (const p of d.periods) {
      locIds.add(p.startLocationId.toHexString());
      locIds.add(p.endLocationId.toHexString());
      for (const sc of p.serviceCommitments) {
        locIds.add(sc.locationId.toHexString());
      }
    }
  }

  const locationNames = new Map<string, string>();
  if (locIds.size > 0) {
    const locs = await getLocationCollection()
      .find(
        {
          _id: { $in: [...locIds].map((id) => new ObjectId(id)) },
          orgId: new ObjectId(orgId),
        },
        { projection: { _id: 1, name: 1 } },
      )
      .toArray();
    for (const l of locs) locationNames.set(l._id.toHexString(), l.name);
  }

  return docs.map((d) => {
    const s = toSchedule(d, locationNames);
    s.totalMinutes = d.periods.reduce(
      (sum, p) => sum + calcPeriodMinutes(p),
      0,
    );
    s.serviceMinutes = d.periods.reduce(
      (sum, p) => sum + calcServiceMinutes(p),
      0,
    );
    return s;
  });
}

export async function getAssignment(
  id: string,
  orgId: string,
): Promise<Schedule> {
  const doc = await findAssignmentById(id, orgId);
  if (!doc) throw new NotFoundError('Schedule');
  return buildScheduleResponse(doc);
}

export async function registerAssignment(
  orgId: string,
  dto: CreateAssignmentDto,
  context: AuditContext,
): Promise<Schedule> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to create schedule');
  }

  // 1) Empleado existe y pertenece al org.
  const employee = await loadEmployeeOrThrow(orgId, dto.userId);

  // 2) Si vino fromTemplateId, cargar la plantilla y rellenar periods vacíos.
  // Esto permite que el drag&drop de plantillas funcione sin que el cliente
  // duplique la lógica de "periods desde template".
  let periods = dto.periods;
  if (dto.fromTemplateId) {
    const tpl = await findTemplateById(dto.fromTemplateId, orgId);
    if (!tpl) {
      throw new ValidationError([
        { field: 'fromTemplateId', message: 'Template no encontrado' },
      ]);
    }
    if (!periods || periods.length === 0 || !periods[0].startLocationId) {
      // Caso: drop directo de una plantilla, el cliente mandó period vacío.
      // Construimos el period inicial desde la plantilla.
      periods = [
        {
          shiftType: tpl.shiftType,
          startTime: tpl.defaultStartTime,
          endTime: tpl.defaultEndTime,
          multiDay: tpl.shiftType === 'multi_day',
          endDayOffset: tpl.shiftType === 'multi_day' ? 1 : 0,
          expectedDurationDays: tpl.shiftType === 'multi_day' ? 1 : null,
          startLocationId: tpl.defaultStartLocationId ?? '',
          endLocationId:
            tpl.defaultEndLocationId ?? tpl.defaultStartLocationId ?? '',
          serviceCommitments: tpl.defaultServiceCommitments.map((sc) => ({
            locationId: sc.locationId,
            startTime: sc.startTime,
            endTime: sc.endTime,
            serviceType: sc.serviceType,
            clientReference: null,
            isMandatory: sc.isMandatory,
            arrivalTolerance: sc.arrivalTolerance,
            notes: null,
          })),
          applyAutoBreak: tpl.applyAutoBreak,
          breakDurationMinutes: tpl.breakDurationMinutes,
          coveringForUserId: null,
          coverageReason: null,
          notes: null,
        },
      ];

      if (!periods[0].startLocationId) {
        throw new ValidationError([
          {
            field: 'fromTemplateId',
            message:
              'La plantilla no tiene ubicación por defecto. Edita el turno para asignarla.',
          },
        ]);
      }
    }
  }

  if (!periods || periods.length === 0) {
    throw new ValidationError('periods debe contener al menos un periodo');
  }

  // 3) Validar coherencia interna de cada period.
  for (const period of periods) {
    validatePeriodTimes(period);
    validateCommitmentsInsidePeriod(period);
  }

  // 4) Validar referencias de ubicaciones.
  const locIds = collectLocationIds(periods);
  if (locIds.length > 0) await validateLocationsExist(orgId, locIds);

  const workDate = normalizeWorkDate(dto.workDate);

  // 5) Detectar conflictos (no bloqueantes).
  const conflicts = await detectConflicts({
    orgId,
    userId: dto.userId,
    workDate,
    periods,
    excludeAssignmentId: null,
  });

  // 6) Crear documento.
  const doc = await createAssignment({
    ...dto,
    periods,
    workDate,
    orgId,
    createdBy: context.actor.id,
    createdByName: context.actor.displayName,
    userName: employee.displayName,
    userPosition: employee.position,
  });

  await emitAuditEvent({
    category: 'schedules',
    action: 'schedule_created',
    target: {
      type: 'schedule_assignment',
      id: doc._id.toHexString(),
      displayName: `${employee.displayName} · ${workDate.toISOString().slice(0, 10)}`,
    },
    metadata: {
      userId: dto.userId,
      workDate: workDate.toISOString().slice(0, 10),
      periodsCount: periods.length,
      fromTemplateId: dto.fromTemplateId,
      conflictTypes: conflicts.map((c) => c.type),
    },
    context,
  });

  return buildScheduleResponse(doc, conflicts);
}

const ASSIGNMENT_UPDATABLE_FIELDS = [
  'workDate',
  'periods',
  'notes',
] as const satisfies readonly (keyof UpdateAssignmentDto)[];

export async function editAssignment(
  id: string,
  orgId: string,
  dto: UpdateAssignmentDto,
  context: AuditContext,
): Promise<Schedule> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to update schedule');
  }

  const existing = await findAssignmentById(id, orgId);
  if (!existing) throw new NotFoundError('Schedule');

  if (dto.periods) {
    for (const period of dto.periods) {
      validatePeriodTimes(period);
      validateCommitmentsInsidePeriod(period);
    }
    const locIds = collectLocationIds(dto.periods);
    if (locIds.length > 0) await validateLocationsExist(orgId, locIds);
  }

  const newWorkDate = dto.workDate
    ? normalizeWorkDate(dto.workDate)
    : existing.workDate;

  const updated = await updateAssignmentDoc(id, orgId, {
    ...dto,
    workDate: dto.workDate ? newWorkDate : undefined,
    updatedBy: context.actor.id,
    updatedByName: context.actor.displayName,
  });
  if (!updated) throw new NotFoundError('Schedule');

  // computeDiff: compara campos relevantes. periods se compara por igualdad
  // estructural; si cambió, el diff lo refleja.
  const diff = computeDiff(
    {
      workDate: existing.workDate,
      periods: existing.periods,
      notes: existing.notes,
    },
    {
      workDate: updated.workDate,
      periods: updated.periods,
      notes: updated.notes,
    },
    { allowedFields: ASSIGNMENT_UPDATABLE_FIELDS },
  );

  if (diff) {
    await emitAuditEvent({
      category: 'schedules',
      action: 'schedule_updated',
      target: {
        type: 'schedule_assignment',
        id,
        displayName: existing.denormalizedRefs.userName ?? id,
      },
      diff,
      context,
    });
  }

  // Recalcular conflictos sobre los datos finales.
  const conflicts = await detectConflicts({
    orgId,
    userId: updated.userId.toHexString(),
    workDate: updated.workDate,
    periods: dto.periods ?? existing.periods.map((p) => ({
      shiftType: p.shiftType,
      startTime: p.startTime,
      endTime: p.endTime,
      multiDay: p.multiDay,
      endDayOffset: p.endDayOffset,
      expectedDurationDays: p.expectedDurationDays,
      startLocationId: p.startLocationId.toHexString(),
      endLocationId: p.endLocationId.toHexString(),
      serviceCommitments: p.serviceCommitments.map((sc) => ({
        locationId: sc.locationId.toHexString(),
        startTime: sc.startTime,
        endTime: sc.endTime,
        serviceType: sc.serviceType,
        clientReference: sc.clientReference,
        isMandatory: sc.isMandatory,
        arrivalTolerance: sc.arrivalTolerance,
        notes: sc.notes,
      })),
      applyAutoBreak: p.applyAutoBreak,
      breakDurationMinutes: p.breakDurationMinutes,
      coveringForUserId: p.coveringForUserId
        ? p.coveringForUserId.toHexString()
        : null,
      coverageReason: p.coverageReason,
      notes: p.notes,
    })),
    excludeAssignmentId: id,
  });

  return buildScheduleResponse(updated, conflicts);
}

export async function removeAssignment(
  id: string,
  orgId: string,
  context: AuditContext,
): Promise<void> {
  if (!context.actor) {
    throw new ForbiddenError('Actor required to delete schedule');
  }

  const existing = await findAssignmentById(id, orgId);
  if (!existing) throw new NotFoundError('Schedule');

  const ok = await softDeleteAssignment(id, orgId);
  if (!ok) throw new NotFoundError('Schedule');

  await emitAuditEvent({
    category: 'schedules',
    action: 'schedule_deleted',
    target: {
      type: 'schedule_assignment',
      id,
      displayName: existing.denormalizedRefs.userName ?? id,
    },
    metadata: {
      userId: existing.userId.toHexString(),
      workDate: existing.workDate.toISOString().slice(0, 10),
    },
    context,
  });

  logger.info({ id, orgId }, 'Schedule soft-deleted');
}

// ── Conflicts — endpoint informativo ──────────────────────────────────────

export async function listConflicts(
  user: AuthenticatedUser,
  orgId: string,
  filter: { userId?: string; startDate: Date; endDate: Date },
): Promise<{ assignmentId: string; userId: string; workDate: string; conflicts: ScheduleConflict[] }[]> {
  const scopeFilter = await buildScopeFilter(
    user,
    user.permissionScope,
    'schedules',
  );

  const docs = await findAssignments(
    orgId,
    {
      startDate: filter.startDate,
      endDate: filter.endDate,
      userId: filter.userId,
    },
    scopeFilter,
  );

  const result = await Promise.all(
    docs.map(async (d) => {
      const periodsDto: WorkPeriodDto[] = d.periods.map((p) => ({
        shiftType: p.shiftType,
        startTime: p.startTime,
        endTime: p.endTime,
        multiDay: p.multiDay,
        endDayOffset: p.endDayOffset,
        expectedDurationDays: p.expectedDurationDays,
        startLocationId: p.startLocationId.toHexString(),
        endLocationId: p.endLocationId.toHexString(),
        serviceCommitments: p.serviceCommitments.map((sc) => ({
          locationId: sc.locationId.toHexString(),
          startTime: sc.startTime,
          endTime: sc.endTime,
          serviceType: sc.serviceType,
          clientReference: sc.clientReference,
          isMandatory: sc.isMandatory,
          arrivalTolerance: sc.arrivalTolerance,
          notes: sc.notes,
        })),
        applyAutoBreak: p.applyAutoBreak,
        breakDurationMinutes: p.breakDurationMinutes,
        coveringForUserId: p.coveringForUserId
          ? p.coveringForUserId.toHexString()
          : null,
        coverageReason: p.coverageReason,
        notes: p.notes,
      }));

      const conflicts = await detectConflicts({
        orgId,
        userId: d.userId.toHexString(),
        workDate: d.workDate,
        periods: periodsDto,
        excludeAssignmentId: d._id.toHexString(),
      });

      return {
        assignmentId: d._id.toHexString(),
        userId: d.userId.toHexString(),
        workDate: d.workDate.toISOString().slice(0, 10),
        conflicts,
      };
    }),
  );

  // Solo devolver assignments con conflictos.
  return result.filter((r) => r.conflicts.length > 0);
}

// Re-export helper para tests externos.
export { toScheduleTemplate };
