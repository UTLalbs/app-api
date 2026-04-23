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
import {NotFoundError, ForbiddenError} from "../../../shared/errors/AppError";
import {emitAuditEvent} from "../../audit/audit.service";
import type {AuditContext} from "../../audit/audit.types";
import type {User} from "../../users/user.types";
import {findDocumentProfileById} from "../document-profiles/document-profile.repository";

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
	ChecklistStatus,
	DocumentStatus,
	DocumentType,
	EmergencyContact,
	EmployeeProfileDocument,
	EmployeeQueryFilter,
	EmploymentStatus,
	RenewalFrom,
	WaivedReason,
} from "./employee.types";

// ── Listar empleados ───────────────────────────────────────────────────────

export async function listEmployees(
	orgId: string,
	filter: EmployeeQueryFilter,
): Promise<{employees: User[]; total: number}> {
	return findAllEmployees(orgId, filter);
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
): Promise<User> {
	const existing = await findEmployeeById(id, orgId);
	if ( !existing ) throw new NotFoundError( "Employee" );

	// Inicializar arrays faltantes
	await initEmployeeArrays(id, orgId);

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

	logger.info(
		{employeeId: id, changedFields: Object.keys(fields).length},
		"Employee profile updated",
	);

	// Auditoría: detectar si los cambios tocan PII → acción sensible (180d retention).
	const PII_KEYS = new Set(["rfc", "curp", "nss", "bankAccounts"]);
	const touchedPii = Object.keys(fields).some((k) => PII_KEYS.has(k));

	if (context) {
		await emitAuditEvent({
			category: "employees",
			action: touchedPii ? "employee_pii_updated" : "employee_updated",
			target: {type: "employee", id, displayName: final.displayName},
			metadata: {changedFields: Object.keys(fields)},
			context,
		});
	}

	return final;
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
): Promise<User> {
	const updated = await addEmergencyContact(id, orgId, data);
	if (!updated) throw new NotFoundError("Employee");
	return updated;
}

export async function editContact(
	id: string,
	orgId: string,
	contactId: string,
	data: Partial<Omit<EmergencyContact, "_id">>,
): Promise<User> {
	const updated = await updateEmergencyContact(id, orgId, contactId, data);
	if (!updated) throw new NotFoundError("EmergencyContact");
	return updated;
}

export async function deleteContact(
	id: string,
	orgId: string,
	contactId: string,
): Promise<void> {
	const deleted = await removeEmergencyContact(id, orgId, contactId);
	if (!deleted) throw new NotFoundError("EmergencyContact");
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
) {
	const existing = await findEmployeeById(id, orgId);
	if (!existing) throw new NotFoundError("Employee");

	const account = await addBankAccount(id, orgId, data);
	if (!account) throw new NotFoundError("Employee");

	logger.info({employeeId: id, bankName: data.bankName}, "Bank account added");

	return account;
}

export async function editAccount(
	id: string,
	orgId: string,
	accountId: string,
	data: {bankName?: string; isDefault?: boolean; documentUrl?: string | null},
): Promise<User> {
	const updated = await updateBankAccount(id, orgId, accountId, data);
	if (!updated) throw new NotFoundError("BankAccount");
	return updated;
}

export async function deleteAccount(
	id: string,
	orgId: string,
	accountId: string,
): Promise<void> {
	const deleted = await removeBankAccount(id, orgId, accountId);
	if (!deleted) throw new NotFoundError("BankAccount");
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
): Promise<User> {
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
