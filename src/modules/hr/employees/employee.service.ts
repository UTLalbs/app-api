import {ObjectId} from "mongodb";

import {logger} from "../../../config/logger";
import {
	validateFile,
	uploadFile,
	deleteFile,
	getPresignedUrl,
	generateS3Key,
	extractKeyFromUrl,
} from "../../../infrastructure/storage/s3.service";
import {
	buildScopeFilter,
	invalidateTeamHierarchyCache,
} from "../../../middleware/scope";
import {
	NotFoundError,
	ForbiddenError,
	ValidationError,
} from "../../../shared/errors/AppError";
import {computeDiff} from "../../../shared/utils/diff";
import type {AuthenticatedUser} from "../../auth/auth.types";
import {emitAuditEvent} from "../../audit/audit.service";
import type {AuditContext} from "../../audit/audit.types";
import type {User} from "../../users/user.types";
import {findDocumentProfileById} from "../document-profiles/document-profile.repository";
import {normalizeWorkDate} from "../schedules/schedule.helpers";
import {
	createAssignment,
	findAssignmentsByUserAndDate,
	findTemplateById,
} from "../schedules/schedule.repository";
import type {
	ScheduleTemplate,
	WorkPeriodDto,
} from "../schedules/schedule.types";

import {buildChecklist} from "./employee.checklist";
import {
	findAllEmployees,
	findEmployeeById,
	updateEmployeeProfile,
	addEmergencyContact,
	updateEmergencyContact,
	removeEmergencyContact,
	addBankAccount,
	updateBankAccount,
	removeBankAccount,
	addEmployeeDocument,
	updateEmployeeDocument,
	removeEmployeeDocument,
	addChecklistItems,
	updateChecklistItem,
	removeChecklistItem,
	initEmployeeArrays,
	updateEmploymentStatus,
} from "./employee.repository";
import type {
	BankAccount,
	ChecklistStatus,
	DayOfWeek,
	DayShiftDocument,
	DocumentStatus,
	DocumentType,
	EmergencyContact,
	EmployeeDocument,
	EmployeeProfileDocument,
	EmployeeQueryFilter,
	EmployeeWorkScheduleDocument,
	EmploymentStatus,
	RenewalFrom,
	WaivedReason,
	WeeklyPatternDocument,
} from "./employee.types";
import {
	validateWorkSchedule,
	type ScheduleWarning,
} from "./workSchedule.helpers";

// ── Helpers internos para workSchedule ─────────────────────────────────────

function toObjectIdOrNull(value: unknown): ObjectId | null {
	if (!value) return null;
	if (value instanceof ObjectId) return value;
	if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
	return null;
}

function convertPatternIdsToObjectIds(
	pattern: WeeklyPatternDocument,
): WeeklyPatternDocument {
	const days: DayOfWeek[] = [
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
		"sunday",
	];
	return Object.fromEntries(
		days.map((day) => {
			const shift = pattern[day];
			if (!shift) return [day, null];
			return [
				day,
				{
					...shift,
					startLocationId: toObjectIdOrNull(shift.startLocationId),
					endLocationId: toObjectIdOrNull(shift.endLocationId),
				} as DayShiftDocument,
			];
		}),
	) as WeeklyPatternDocument;
}

// ── Listar empleados ───────────────────────────────────────────────────────
//
// Aplica scope del rol que autorizó la petición (req.user.permissionScope):
//   - all   → sin filtro adicional, lista toda la org.
//   - team  → solo el usuario y los empleados que reportan a él (directa o
//             indirectamente, hasta 5 niveles).
//   - self  → solo su propio expediente.
//   - custom → filtros por departamento, puesto o ubicación (una dimensión).

export async function listEmployees(
	orgId: string,
	filter: EmployeeQueryFilter,
	user: AuthenticatedUser,
): Promise<{employees: User[]; total: number}> {
	const scopeFilter = await buildScopeFilter(
		user,
		user.permissionScope,
		"users",
	);
	return findAllEmployees(orgId, filter, scopeFilter as Record<string, unknown>);
}

// ── Obtener empleado ───────────────────────────────────────────────────────
//
// Lectura sensible: cada acceso emite `employee_pii_read` (retención 180 días).
// Si se llama desde un job interno (sin context), se pasa `undefined` y se omite.

export async function getEmployee(
	id: string,
	orgId: string,
	context?: AuditContext,
): Promise<User> {
	const employee = await findEmployeeById(id, orgId);
	if (!employee) throw new NotFoundError("Employee");

	if (context) {
		await emitAuditEvent({
			category: "reads",
			action: "employee_pii_read",
			target: {type: "employee", id, displayName: employee.displayName},
			context,
		});
	}

	return employee;
}

// ── Actualizar perfil ──────────────────────────────────────────────────────

export async function editEmployeeProfile(
	id: string,
	orgId: string,
	fields: Partial<EmployeeProfileDocument>,
	_actorId: string,
	context?: AuditContext,
): Promise<{user: User; warnings: ScheduleWarning[]}> {
	const existing = await findEmployeeById(id, orgId);
	if ( !existing ) throw new NotFoundError( "Employee" );

	const warnings: ScheduleWarning[] = [];

	// Capturar managerId previo para invalidar caches de jerarquía
	// si cambia (afecta al empleado, al manager anterior y al nuevo).
	const previousManagerId = existing.employeeProfile?.managerId
		? String(existing.employeeProfile.managerId)
		: null;

	// Inicializar arrays faltantes
	await initEmployeeArrays(id, orgId);

	// Normalización de metadata del RFC:
	// `rfcValidatedAt` y `rfcValidatedStatus` sólo pueden cambiar cuando el valor
	// del RFC cambia. El frontend puede estar re-enviándolos en cada submit
	// (por haber disparado la validación al abrir el form); los descartamos si
	// el RFC no viene, o si viene igual al guardado. Así evitamos revalidar y
	// ensuciar el diff / audit log en cada guardado.
	const currentRfc = existing.employeeProfile?.rfc ?? null;
	const rfcChanged =
		fields.rfc !== undefined && fields.rfc !== currentRfc;
	if (!rfcChanged) {
		if ("rfcValidatedAt" in fields) delete fields.rfcValidatedAt;
		if ("rfcValidatedStatus" in fields) delete fields.rfcValidatedStatus;
		if (fields.rfc !== undefined && fields.rfc === currentRfc) {
			// rfc idéntico → también lo sacamos para no dejarlo en changedFields.
			delete fields.rfc;
		}
	}

	// Si isEmployee se está activando por primera vez y no hay employmentStatus
	// (ni en fields ni en el doc existente), default a 'active'. Sin esto, la
	// lista de empleados (que filtra por employmentStatus='active') no muestra
	// al recién promovido.
	const wasEmployeeBefore = existing.employeeProfile?.isEmployee ?? false;
	const isBeingPromoted = !wasEmployeeBefore && fields.isEmployee === true;
	if (
		isBeingPromoted &&
		!fields.employmentStatus &&
		!existing.employeeProfile?.employmentStatus
	) {
		fields.employmentStatus = "active";
	}

	// Si viene workSchedule, validar contra LFT/NOM-087 (D4=advertir, no bloquea),
	// convertir IDs a ObjectId para persistencia y sellar timestamps.
	if (fields.workSchedule) {
		const lintResults = validateWorkSchedule(fields.workSchedule);
		warnings.push(...lintResults);
		if (lintResults.length > 0) {
			logger.warn(
				{employeeId: id, warnings: lintResults},
				"workSchedule guardado con advertencias legales",
			);
		}
		const previousSchedule = existing.employeeProfile?.workSchedule ?? null;
		fields.workSchedule = {
			...fields.workSchedule,
			templateId: toObjectIdOrNull(fields.workSchedule.templateId),
			customPattern: fields.workSchedule.customPattern
				? convertPatternIdsToObjectIds(fields.workSchedule.customPattern)
				: null,
			createdAt: previousSchedule?.createdAt ?? new Date(),
			updatedAt: new Date(),
		};
	}

	// Si viene employmentStatus → sincronizar User.status y deletedAt
	if (fields.employmentStatus) {
		await updateEmploymentStatus(id, orgId, fields.employmentStatus);
		// Remover employmentStatus de fields para no duplicar el $set
		const rest: Partial<EmployeeProfileDocument> = Object.fromEntries(
			Object.entries(fields).filter(([key]) => key !== "employmentStatus"),
		) as Partial<EmployeeProfileDocument>;

		fields = rest;
	}

	// Si quedan más campos que actualizar
	if (Object.keys(fields).length > 0) {
		const updated = await updateEmployeeProfile(id, orgId, fields);
		if (!updated) throw new NotFoundError("Employee");

		// Si isEmployee acaba de activarse → generar checklist automáticamente
		const wasEmployee = existing.employeeProfile?.isEmployee ?? false;
		const isNowEmployee = fields.isEmployee === true;
		const checklistEmpty =
			(updated.employeeProfile?.checklist?.length ?? 0) === 0;

		if ((!wasEmployee && isNowEmployee) || (isNowEmployee && checklistEmpty)) {
			const newItems = buildChecklist();

			if (newItems.length > 0) {
				await addChecklistItems(id, orgId, newItems);
				logger.info(
					{employeeId: id, itemsAdded: newItems.length},
					"Checklist auto-generated on isEmployee activation",
				);
			}
		}
	}

	const final = await findEmployeeById(id, orgId);
	if (!final) throw new NotFoundError("Employee");

	// Si el manager cambió, invalidar el cache de team hierarchy del empleado,
	// del manager anterior y del nuevo: cualquiera de los tres puede tener su
	// árbol cacheado y ahora está desactualizado.
	const newManagerId = final.employeeProfile?.managerId
		? String(final.employeeProfile.managerId)
		: null;
	if (newManagerId !== previousManagerId) {
		await invalidateTeamHierarchyCache([
			id,
			previousManagerId,
			newManagerId,
		]);
	}

	logger.info(
		{employeeId: id, changedFields: Object.keys(fields).length},
		"Employee profile updated",
	);

	// Auditoría: computar diff real (before vs after, solo campos del DTO).
	// computeDiff enmascara PII (rfc/curp/nss/clabe/…) y filtra campos sin cambio —
	// si el frontend mandó el formulario completo, solo queda lo que realmente cambió.
	if (context) {
		const diff = computeDiff(
			existing.employeeProfile ?? {},
			final.employeeProfile ?? {},
			{
				allowedFields: Object.keys(
					fields,
				) as (keyof EmployeeProfileDocument)[],
			},
		);

		if (diff) {
			const touchedPii = Object.values(diff).some(
				(entry) => entry.isMasked === true,
			);
			await emitAuditEvent({
				category: "employees",
				action: touchedPii ? "employee_pii_updated" : "employee_updated",
				target: {type: "employee", id, displayName: final.displayName},
				diff,
				context,
			});
		}
	}

	return {user: final, warnings};
}

// ── Generar Schedule Assignments desde el patrón base ──────────────────────
//
// Materializa el `workSchedule` del empleado en `ScheduleAssignment` diarios
// para el rango [from, to]. Días sin turno o en `restDays` se omiten. Si ya
// existe cualquier assignment activo para (userId, fecha), se respeta — el
// usuario debe borrar el existente si quiere regenerar.

const DAYS_OF_WEEK: DayOfWeek[] = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];

// JS Date.getUTCDay(): 0=domingo, 1=lunes, ... 6=sábado.
const JS_DAY_TO_NAME: Record<number, DayOfWeek> = {
	0: "sunday",
	1: "monday",
	2: "tuesday",
	3: "wednesday",
	4: "thursday",
	5: "friday",
	6: "saturday",
};

// Hidrata el patrón semanal: si hay customPattern lo usa tal cual; si solo hay
// templateId, replica el shift del template a cada día NO incluido en restDays.
function hydratePattern(
	workSchedule: EmployeeWorkScheduleDocument,
	template: ScheduleTemplate | null,
): WeeklyPatternDocument | null {
	if (workSchedule.customPattern) return workSchedule.customPattern;
	if (!template) return null;

	const sharedShift: DayShiftDocument = {
		shiftType: template.shiftType,
		startTime: template.defaultStartTime,
		endTime: template.defaultEndTime,
		multiDay: template.shiftType === "multi_day",
		endDayOffset: template.shiftType === "multi_day" ? 1 : 0,
		startLocationId: template.defaultStartLocationId
			? new ObjectId(template.defaultStartLocationId)
			: null,
		endLocationId: template.defaultEndLocationId
			? new ObjectId(template.defaultEndLocationId)
			: template.defaultStartLocationId
				? new ObjectId(template.defaultStartLocationId)
				: null,
		applyAutoBreak: template.applyAutoBreak,
		breakDurationMinutes: template.breakDurationMinutes,
		breakStartTime: null,
		breakEndTime: null,
		notes: null,
	};

	const pattern: WeeklyPatternDocument = {
		monday: null,
		tuesday: null,
		wednesday: null,
		thursday: null,
		friday: null,
		saturday: null,
		sunday: null,
	};
	for (const day of DAYS_OF_WEEK) {
		if (!workSchedule.restDays.includes(day)) pattern[day] = sharedShift;
	}
	return pattern;
}

// Defensivo: el campo puede llegar como ObjectId o string según la ruta de
// escritura (validator persiste strings; escrituras nuevas usan ObjectId).
function locIdToHex(value: unknown): string | null {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (value instanceof ObjectId) return value.toHexString();
	if (typeof (value as {toHexString?: () => string}).toHexString === "function") {
		return (value as {toHexString: () => string}).toHexString();
	}
	return String(value);
}

export function dayShiftToWorkPeriodDto(
	shift: DayShiftDocument,
): WorkPeriodDto | null {
	const startId = locIdToHex(shift.startLocationId);
	// endLocationId opcional — si no está, asumimos misma que start.
	const endId = locIdToHex(shift.endLocationId) ?? startId;
	if (!startId) return null;
	return {
		shiftType: shift.shiftType,
		startTime: shift.startTime,
		endTime: shift.endTime,
		multiDay: shift.multiDay,
		endDayOffset: shift.endDayOffset,
		expectedDurationDays: shift.multiDay ? Math.max(shift.endDayOffset, 1) : null,
		startLocationId: startId,
		endLocationId: endId!,
		serviceCommitments: [],
		applyAutoBreak: shift.applyAutoBreak,
		breakDurationMinutes: shift.breakDurationMinutes,
		breakStartTime: shift.breakStartTime ?? null,
		breakEndTime: shift.breakEndTime ?? null,
		coveringForUserId: null,
		coverageReason: null,
		notes: shift.notes,
	};
}

interface GenerateResult {
	created: number;
	skipped: number;
	errors: {date: string; reason: string}[];
	warnings: ScheduleWarning[];
}

export async function generateAssignmentsFromWorkSchedule(
	employeeId: string,
	orgId: string,
	from: Date,
	to: Date,
	context: AuditContext,
): Promise<GenerateResult> {
	if (!context.actor) {
		throw new ForbiddenError("Actor required to generate schedule assignments");
	}

	const employee = await findEmployeeById(employeeId, orgId);
	if (!employee) throw new NotFoundError("Employee");
	if (!employee.employeeProfile?.isEmployee) {
		throw new ValidationError("El usuario no es empleado");
	}

	// El profile leído por findEmployeeById es el dominio (ObjectIds → strings).
	// Reconstruimos la versión Document para uso interno.
	const profile = employee.employeeProfile;
	if (!profile.workSchedule) {
		throw new ValidationError(
			"El empleado no tiene un horario base configurado (workSchedule).",
		);
	}

	const ws = profile.workSchedule;

	// Modo task_based: el empleado no tiene horario programado. No-op idempotente.
	if (ws.mode === "task_based") {
		return {created: 0, skipped: 0, errors: [], warnings: []};
	}

	// `findEmployeeById` devuelve domain (`EmployeeWorkSchedule`). Convertir
	// a Document re-creando ObjectIds donde aplica para reutilizar las helpers.
	const wsDoc: EmployeeWorkScheduleDocument = {
		mode: ws.mode,
		jornadaType: ws.jornadaType,
		templateId: ws.templateId ? new ObjectId(ws.templateId) : null,
		customPattern: ws.customPattern
			? (Object.fromEntries(
					DAYS_OF_WEEK.map((day) => {
						const shift = ws.customPattern![day];
						return [
							day,
							shift
								? ({
										...shift,
										startLocationId: shift.startLocationId
											? new ObjectId(shift.startLocationId)
											: null,
										endLocationId: shift.endLocationId
											? new ObjectId(shift.endLocationId)
											: null,
									} as DayShiftDocument)
								: null,
						];
					}),
				) as WeeklyPatternDocument)
			: null,
		weeklyMaxHours: ws.weeklyMaxHours,
		restDays: ws.restDays,
		effectiveFrom: ws.effectiveFrom,
		effectiveTo: ws.effectiveTo,
		createdAt: ws.createdAt,
		updatedAt: ws.updatedAt,
	};

	// Validaciones legales (informativas — no bloquean).
	const warnings = validateWorkSchedule(wsDoc);

	// Hidratar pattern desde template si es necesario.
	const template = wsDoc.templateId
		? await findTemplateById(wsDoc.templateId.toHexString(), orgId)
		: null;
	const pattern = hydratePattern(wsDoc, template);
	if (!pattern) {
		throw new ValidationError(
			"workSchedule sin patrón hidratable: template no existe o no tiene defaults.",
		);
	}

	const result: GenerateResult = {
		created: 0,
		skipped: 0,
		errors: [],
		warnings,
	};

	const cursor = new Date(normalizeWorkDate(from));
	const end = new Date(normalizeWorkDate(to));

	while (cursor <= end) {
		const dayName = JS_DAY_TO_NAME[cursor.getUTCDay()];
		const isoDate = cursor.toISOString().slice(0, 10);
		const shift = pattern[dayName];

		// Día sin turno asignado (descanso implícito).
		if (!shift || ws.restDays.includes(dayName)) {
			result.skipped++;
			cursor.setUTCDate(cursor.getUTCDate() + 1);
			continue;
		}

		// Si ya existe cualquier assignment vivo para esta fecha, respetar.
		const existing = await findAssignmentsByUserAndDate(
			orgId,
			employeeId,
			new Date(cursor),
		);
		if (existing.length > 0) {
			result.skipped++;
			cursor.setUTCDate(cursor.getUTCDate() + 1);
			continue;
		}

		const periodDto = dayShiftToWorkPeriodDto(shift);
		if (!periodDto) {
			result.errors.push({
				date: isoDate,
				reason:
					"Falta startLocationId/endLocationId en el patrón. Edita el horario y agrega ubicaciones.",
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
			continue;
		}

		await createAssignment({
			userId: employeeId,
			workDate: new Date(cursor),
			periods: [periodDto],
			fromTemplateId: wsDoc.templateId ? wsDoc.templateId.toHexString() : null,
			notes: null,
			orgId,
			createdBy: context.actor.id,
			createdByName: context.actor.displayName,
			userName: employee.displayName,
			userPosition: profile.position ?? null,
		});
		result.created++;

		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	logger.info(
		{
			employeeId,
			from: from.toISOString(),
			to: to.toISOString(),
			...result,
		},
		"Schedule assignments generated from workSchedule",
	);

	if (context) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_updated",
			target: {type: "employee", id: employeeId, displayName: employee.displayName},
			metadata: {
				operation: "generate_schedule_assignments",
				from: from.toISOString(),
				to: to.toISOString(),
				created: result.created,
				skipped: result.skipped,
				errors: result.errors.length,
			},
			context,
		});
	}

	return result;
}

// ── Cambiar estatus de empleo ─────────────────────────────────────────────
export async function changeEmploymentStatus(
	id: string,
	orgId: string,
	status: EmploymentStatus,
	context?: AuditContext,
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	const updated = await updateEmploymentStatus(id, orgId, status);
	if (!updated) throw new NotFoundError("Employee");

	const previous = existing.employeeProfile?.employmentStatus;

	if (context) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_status_changed",
			target: {type: "employee", id, displayName: updated.displayName},
			diff: {employmentStatus: {old: previous, new: status}},
			context,
		});
	}

	return updated;
}

// ── Emergency Contacts ─────────────────────────────────────────────────────

export async function addContact(
	id: string,
	orgId: string,
	data: Omit<EmergencyContact, "_id">,
	context?: AuditContext,
): Promise<User> {
	const updated = await addEmergencyContact(id, orgId, data);
	if (!updated) throw new NotFoundError("Employee");

	if (context) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_updated",
			target: {type: "employee", id, displayName: updated.displayName},
			metadata: {
				operation: "emergency_contact_added",
				contactName: data.name,
				relationship: data.relationship,
			},
			context,
		});
	}

	return updated;
}

export async function editContact(
	id: string,
	orgId: string,
	contactId: string,
	data: Partial<Omit<EmergencyContact, "_id">>,
	context?: AuditContext,
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	const before = existing?.employeeProfile?.emergencyContacts?.find(
		(c) => c._id.toString() === contactId,
	);

	const updated = await updateEmergencyContact(id, orgId, contactId, data);
	if (!updated) throw new NotFoundError("EmergencyContact");

	if (context && before) {
		const after = updated.employeeProfile?.emergencyContacts?.find(
			(c) => c._id.toString() === contactId,
		);
		if (after) {
			const diff = computeDiff(before, after, {
				allowedFields: Object.keys(data) as (keyof EmergencyContact)[],
			});
			if (diff) {
				await emitAuditEvent({
					category: "employees",
					action: "employee_updated",
					target: {type: "employee", id, displayName: updated.displayName},
					diff,
					metadata: {operation: "emergency_contact_updated", contactId},
					context,
				});
			}
		}
	}

	return updated;
}

export async function deleteContact(
	id: string,
	orgId: string,
	contactId: string,
	context?: AuditContext,
): Promise<void> {
	const existing = await findEmployeeById(id, orgId);
	const contact = existing?.employeeProfile?.emergencyContacts?.find(
		(c) => c._id.toString() === contactId,
	);

	const deleted = await removeEmergencyContact(id, orgId, contactId);
	if (!deleted) throw new NotFoundError("EmergencyContact");

	if (context && existing && contact) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_updated",
			target: {type: "employee", id, displayName: existing.displayName},
			metadata: {
				operation: "emergency_contact_deleted",
				contactName: contact.name,
				relationship: contact.relationship,
			},
			context,
		});
	}
}

// ── Bank Accounts ──────────────────────────────────────────────────────────

export async function addAccount(
	id: string,
	orgId: string,
	data: {
		bankName: string;
		accountNumber: string;
		clabe: string;
		isDefault: boolean;
		documentUrl: string | null;
	},
	context?: AuditContext,
) {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	const account = await addBankAccount(id, orgId, data);
	if (!account) throw new NotFoundError("Employee");

	logger.info({employeeId: id, bankName: data.bankName}, "Bank account added");

	if (context) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_pii_updated",
			target: {type: "employee", id, displayName: existing.displayName},
			metadata: {
				operation: "bank_account_added",
				bankName: data.bankName,
				isDefault: data.isDefault,
			},
			context,
		});
	}

	return account;
}

export async function editAccount(
	id: string,
	orgId: string,
	accountId: string,
	data: {bankName?: string; isDefault?: boolean; documentUrl?: string | null},
	context?: AuditContext,
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	const before = existing?.employeeProfile?.bankAccounts?.find(
		(a) => a._id.toString() === accountId,
	);

	const updated = await updateBankAccount(id, orgId, accountId, data);
	if (!updated) throw new NotFoundError("BankAccount");

	if (context && before) {
		const after = updated.employeeProfile?.bankAccounts?.find(
			(a) => a._id.toString() === accountId,
		);
		if (after) {
			const diff = computeDiff(before, after, {
				allowedFields: Object.keys(data) as (keyof BankAccount)[],
			});
			if (diff) {
				await emitAuditEvent({
					category: "employees",
					action: "employee_pii_updated",
					target: {type: "employee", id, displayName: updated.displayName},
					diff,
					metadata: {operation: "bank_account_updated", accountId},
					context,
				});
			}
		}
	}

	return updated;
}

export async function deleteAccount(
	id: string,
	orgId: string,
	accountId: string,
	context?: AuditContext,
): Promise<void> {
	const existing = await findEmployeeById(id, orgId);
	const account = existing?.employeeProfile?.bankAccounts?.find(
		(a) => a._id.toString() === accountId,
	);

	const deleted = await removeBankAccount(id, orgId, accountId);
	if (!deleted) throw new NotFoundError("BankAccount");

	if (context && existing && account) {
		await emitAuditEvent({
			category: "employees",
			action: "employee_pii_updated",
			target: {type: "employee", id, displayName: existing.displayName},
			metadata: {
				operation: "bank_account_deleted",
				bankName: account.bankName,
				lastFour: account.lastFour,
			},
			context,
		});
	}
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function uploadDocument(
	id: string,
	orgId: string,
	file: Express.Multer.File,
	meta: {
		type: DocumentType;
		name: string;
		issuedAt: Date | null;
		expiresAt: Date | null;
		alertDays: number;
	},
	_actorId: string,
	context?: AuditContext,
) {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	validateFile(file.mimetype, file.size);

	const key = generateS3Key(
		"employees",
		orgId,
		id,
		meta.type,
		file.originalname,
	);
	const upload = await uploadFile(key, file.buffer, file.mimetype);

	const now = new Date();

	const doc = await addEmployeeDocument(id, orgId, {
		type: meta.type,
		name: meta.name,
		fileUrl: upload.url,
		fileSize: upload.fileSize,
		mimeType: upload.mimeType,
		issuedAt: meta.issuedAt,
		expiresAt: meta.expiresAt,
		alertDays: meta.alertDays,
		hasRenewal: false,
		renewalMonths: null,
		renewalFrom: "upload_date",
		renewalStartDate: now,
		replacedBy: null,
		verifiedAt: null,
		verifiedBy: null,
		status: "pending",
		notes: null,
		uploadedAt: now,
		previousVersions: [],
	});

	if (!doc) throw new NotFoundError("Employee");

	logger.info({employeeId: id, type: meta.type, key}, "Document uploaded");

	if (context) {
		await emitAuditEvent({
			category: "documents",
			action: "employee_document_uploaded",
			target: {type: "employee", id, displayName: existing.displayName},
			metadata: {
				docType: meta.type,
				docName: meta.name,
				fileSize: upload.fileSize,
				mimeType: upload.mimeType,
			},
			context,
		});
	}

	return doc;
}

export async function editDocument(
	id: string,
	orgId: string,
	docId: string,
	fields: {
		status?: DocumentStatus;
		notes?: string | null;
		issuedAt?: Date | null;
		expiresAt?: Date | null;
		alertDays?: number;
		hasRenewal?: boolean;
		renewalMonths?: number | null;
		renewalFrom?: RenewalFrom;
		renewalStartDate?: Date | null;
		verifiedAt?: Date | null;
		verifiedBy?: string | null;
	},
	_actorId: string,
	context?: AuditContext,
): Promise<User> {
	const existingBefore = await findEmployeeById(id, orgId);
	const docBefore = existingBefore?.employeeProfile?.documents?.find(
		(d) => d._id.toString() === docId,
	);

	const verifiedBy = fields.verifiedBy
		? new ObjectId(fields.verifiedBy)
		: fields.verifiedBy === null
			? null
			: undefined;

	const updated = await updateEmployeeDocument(id, orgId, docId, {
		...fields,
		verifiedBy,
	});

	if (!updated) throw new NotFoundError("Document");

	// ── Sincronizar checklist según status del documento ──────────────────
	// ── Sincronizar checklist según status del documento ──────────────────
	if (fields.status === "verified" || fields.status === "rejected") {
		const employee = await findEmployeeById(id, orgId);

		// Buscar el documento para obtener su type
		const doc = employee?.employeeProfile?.documents?.find(
			(d) => d._id.toString() === docId,
		);

		if (doc) {
			// Buscar checklist item por documentId O por type
			const checklistItem = employee?.employeeProfile?.checklist?.find(
				(c) => c.documentId?.toString() === docId || c.type === doc.type,
			);

			if (checklistItem) {
				if (fields.status === "verified") {
					// Documento verificado → checklist a complete + religar documentId
					await updateChecklistItem(id, orgId, String(checklistItem._id), {
						status: "complete",
						documentId: new ObjectId(docId),
					});
				} else {
					// Documento rechazado → checklist a pending + desligar documento
					await updateChecklistItem(id, orgId, String(checklistItem._id), {
						status: "pending",
						documentId: null,
					});
				}
			}
		}
	}

	// Auditoría: diff sobre los campos del DTO (status, notes, fechas, renovación…).
	if (context && docBefore) {
		const docAfter = updated.employeeProfile?.documents?.find(
			(d) => d._id.toString() === docId,
		);
		if (docAfter) {
			const diff = computeDiff(docBefore, docAfter, {
				allowedFields: Object.keys(fields) as (keyof EmployeeDocument)[],
			});
			if (diff) {
				await emitAuditEvent({
					category: "documents",
					action: "employee_document_updated",
					target: {type: "employee", id, displayName: updated.displayName},
					diff,
					metadata: {
						docId,
						docType: docBefore.type,
						docName: docBefore.name,
					},
					context,
				});
			}
		}
	}

	return updated;
}

export async function deleteDocument(
	id: string,
	orgId: string,
	docId: string,
	_actorId: string,
	context?: AuditContext,
): Promise<void> {
	const employee = await findEmployeeById(id, orgId);
	if (!employee) throw new NotFoundError("Employee");

	const doc = employee.employeeProfile?.documents?.find(
		(d) => d._id.toString() === docId,
	);

	if (!doc) throw new NotFoundError("Document");

	const result = await removeEmployeeDocument(id, orgId, docId);
	if (!result) throw new NotFoundError("Document");

	// Eliminar de S3 — fire and forget
	const key = extractKeyFromUrl(result.fileUrl);
	deleteFile(key).catch((err) =>
		logger.error({err, key}, "Failed to delete document from S3"),
	);

	for (const prevUrl of result.previousVersions) {
		const prevKey = extractKeyFromUrl(prevUrl);
		deleteFile(prevKey).catch((err) =>
			logger.error({err, prevKey}, "Failed to delete previous version from S3"),
		);
	}

	logger.info({employeeId: id, docId}, "Document deleted");

	if (context) {
		await emitAuditEvent({
			category: "documents",
			action: "employee_document_deleted",
			target: {type: "employee", id, displayName: employee.displayName},
			metadata: {docType: doc.type, docName: doc.name},
			context,
		});
	}
}

// Emite URL presignada de S3 para un documento. Cada invocación queda auditada
// con retención de 180 días (acceso a PII).
export async function getDocumentUrl(
	id: string,
	orgId: string,
	docId: string,
	context?: AuditContext,
): Promise<{url: string; expiresAt: Date}> {
	const employee = await findEmployeeById(id, orgId);
	if (!employee) throw new NotFoundError("Employee");

	const doc = employee.employeeProfile?.documents?.find(
		(d) => d._id.toString() === docId,
	);

	if (!doc) throw new NotFoundError("Document");

	const key = extractKeyFromUrl(doc.fileUrl);
	const result = await getPresignedUrl(key, 3600);

	if (context) {
		await emitAuditEvent({
			category: "reads",
			action: "employee_document_url_issued",
			target: {type: "employee", id, displayName: employee.displayName},
			metadata: {
				docType: doc.type,
				docName: doc.name,
				expiresAt: result.expiresAt,
			},
			context,
		});
	}

	return result;
}

// ── Checklist ──────────────────────────────────────────────────────────────

export async function generateChecklist(
	id: string,
	orgId: string,
	actorId: string,
	profileId?: string | null,
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	const currentChecklist = existing.employeeProfile?.checklist ?? [];
	const allItems = buildChecklist();

	// Items que ya existen en el checklist
	const existingTypes = new Set(currentChecklist.map((c) => c.type));

	// Items nuevos — solo los que no existen ya
	const newItems = allItems.filter((item) => !existingTypes.has(item.type));
	if (newItems.length === 0) return existing;

	// Si viene profileId → clasificar items según el perfil
	if (profileId) {
		const profile = await findDocumentProfileById(profileId, orgId);

		if (profile) {
			// Crear mapa type → required desde el perfil
			const profileMap = new Map(
				profile.documentTypes.map((entry) => [entry.type, entry.required]),
			);

			const itemsToAdd = newItems.map((item) => {
				if (profileMap.has(item.type)) {
					// Item en el perfil → pending con required del perfil
					return {
						...item,
						required: profileMap.get(item.type) ?? item.required,
						status: "pending" as const,
					};
				} else {
					// Item fuera del perfil → waived (not_applicable)
					return {
						...item,
						status: "waived" as const,
						waivedReason: "not_applicable" as const,
						waivedBy: new ObjectId(actorId),
						waivedAt: new Date(),
						waivedNote: "No aplica según el perfil de expediente asignado",
					};
				}
			});

			const updated = await addChecklistItems(id, orgId, itemsToAdd);
			if (!updated) throw new NotFoundError("Employee");

			logger.info(
				{
					employeeId: id,
					profileId,
					itemsAdded: itemsToAdd.length,
					pending: itemsToAdd.filter((i) => i.status === "pending").length,
					waived: itemsToAdd.filter((i) => i.status === "waived").length,
				},
				"Checklist generated with profile",
			);

			return updated;
		}
	}

	// Sin profileId → todos pending (comportamiento actual)
	const updated = await addChecklistItems(id, orgId, newItems);
	if (!updated) throw new NotFoundError("Employee");

	logger.info(
		{employeeId: id, itemsAdded: newItems.length},
		"Checklist generated",
	);

	return updated;
}

export async function addCustomChecklistItem(
	id: string,
	orgId: string,
	data: {type: string; label: string; required: boolean},
	_actorId: string,
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	const updated = await addChecklistItems(id, orgId, [
		{
			type: data.type,
			label: data.label,
			required: data.required,
			status: "pending",
			documentId: null,
			hasExpiry: false,
			alertDays: null,
			hasRenewal: false,
			renewalMonths: null,
			renewalFrom: "upload_date",
			lastRenewedAt: null,
			waivedBy: null,
			waivedAt: null,
			waivedReason: null,
			waivedNote: null,
		},
	]);

	if (!updated) throw new NotFoundError("Employee");

	return updated;
}

export async function editChecklistItem(
	id: string,
	orgId: string,
	itemId: string,
	data: {
		required?: boolean;
		status?: "complete" | "pending" | "waived";
		waivedReason?: WaivedReason | null;
		waivedNote?: string | null;
		alertDays?: number | null;
		hasExpiry?: boolean;
		hasRenewal?: boolean;
		renewalMonths?: number | null;
		renewalFrom?: RenewalFrom;
		documentId?: string | null;
	},
	actorId: string,
): Promise<User> {
	if (data.status === "waived" && !data.waivedReason) {
		throw new ForbiddenError("waivedReason es requerido al dispensar un item");
	}

	const fields: {
		required?: boolean;
		status?: ChecklistStatus;
		documentId?: ObjectId | null;
		hasExpiry?: boolean;
		alertDays?: number | null;
		hasRenewal?: boolean;
		renewalMonths?: number | null;
		renewalFrom?: RenewalFrom;
		waivedBy?: ObjectId | null;
		waivedAt?: Date | null;
		waivedReason?: WaivedReason | null;
		waivedNote?: string | null;
	} = {};

	if (data.required !== undefined) fields.required = data.required;
	if (data.status !== undefined) fields.status = data.status;
	if (data.hasExpiry !== undefined) fields.hasExpiry = data.hasExpiry;
	if (data.alertDays !== undefined) fields.alertDays = data.alertDays;
	if (data.hasRenewal !== undefined) fields.hasRenewal = data.hasRenewal;
	if (data.renewalMonths !== undefined)
		fields.renewalMonths = data.renewalMonths;
	if (data.renewalFrom !== undefined) fields.renewalFrom = data.renewalFrom;
	if (data.waivedNote !== undefined) fields.waivedNote = data.waivedNote;

	if (data.documentId !== undefined) {
		fields.documentId = data.documentId ? new ObjectId(data.documentId) : null;
	}

	if (data.status === "waived") {
		fields.waivedBy = new ObjectId(actorId);
		fields.waivedAt = new Date();
		fields.waivedReason = data.waivedReason ?? null;
	}

	if (data.status === "pending") {
		// Usar el documentId que viene en el request
		// Si no viene → verificar el actual en MongoDB
		let hasDocument = false;

		if (data.documentId !== undefined) {
			// El request está cambiando el documentId
			hasDocument = data.documentId != null;
		} else {
			// El request no toca documentId — verificar el actual
			const existing = await findEmployeeById(id, orgId);
			const item = existing?.employeeProfile?.checklist?.find(
				(c) => c._id.toString() === itemId,
			);
			hasDocument = item?.documentId != null;
		}

		fields.status = hasDocument ? "complete" : "pending";
		fields.waivedBy = null;
		fields.waivedAt = null;
		fields.waivedReason = null;
		fields.waivedNote = null;
	}

	const updated = await updateChecklistItem(id, orgId, itemId, fields);
	if (!updated) throw new NotFoundError("ChecklistItem");

	return updated;
}

export async function deleteChecklistItem(
	id: string,
	orgId: string,
	itemId: string,
): Promise<void> {
	const deleted = await removeChecklistItem(id, orgId, itemId);
	if (!deleted) throw new NotFoundError("ChecklistItem");
}

// ── Checklist stats ────────────────────────────────────────────────────────

export function computeChecklistMeta(
	checklist: NonNullable<User["employeeProfile"]>["checklist"],
) {
	const total = checklist.length;
	const complete = checklist.filter((i) => i.status === "complete").length;
	const required = checklist.filter((i) => i.required).length;
	const requiredComplete = checklist.filter(
		(i) => i.required && i.status === "complete",
	).length;
	const completion =
		required > 0 ? Math.round((requiredComplete / required) * 100) : 0;

	return {total, complete, required, requiredComplete, completion};
}
