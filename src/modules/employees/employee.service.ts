import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';
import
{
	validateFile,
	uploadFile,
	deleteFile,
	getPresignedUrl,
	generateS3Key,
	extractKeyFromUrl,
} from '../../infrastructure/storage/s3.service';
import { NotFoundError, ForbiddenError } from '../../shared/errors/AppError';
import type { User } from '../users/user.types';

import { getChecklistTemplate } from './employee.checklist';
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
  findAuditLog,
} from './employee.repository';
import type {
  AuditLogEntry,
  ChecklistStatus,
  DocumentStatus,
  DocumentType,
  EmergencyContact,
  EmployeePosition,
  EmployeeProfile,
  EmployeeQueryFilter,
  EmployeeType,
} from './employee.types';

// ── Listar empleados ───────────────────────────────────────────────────────

export async function listEmployees(
  orgId: string,
  filter: EmployeeQueryFilter,
): Promise<{ employees: User[]; total: number }> {
  return findAllEmployees(orgId, filter);
}

// ── Obtener empleado ───────────────────────────────────────────────────────

export async function getEmployee(
  id: string,
  orgId: string,
): Promise<User> {
  const employee = await findEmployeeById(id, orgId);
  if (!employee) throw new NotFoundError('Employee');
  return employee;
}

// ── Actualizar perfil ──────────────────────────────────────────────────────

export async function editEmployeeProfile(
  id: string,
  orgId: string,
  fields: Partial<EmployeeProfile>,
  actorId: string,
): Promise<User> {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  const currentProfile = existing.employeeProfile!;

  // Generar audit log para campos que cambiaron
  const auditEntries: AuditLogEntry[] = [];

  for (const [key, newValue] of Object.entries(fields)) {
    const oldValue = currentProfile[key as keyof EmployeeProfile];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      auditEntries.push({
        _id:       new ObjectId(),
        field:     key,
        oldValue,
        newValue,
        changedBy: new ObjectId(actorId),
        changedAt: new Date(),
        reason:    null,
      });
    }
  }

  const updated = await updateEmployeeProfile(id, orgId, fields, auditEntries);
  if (!updated) throw new NotFoundError('Employee');

  logger.info(
    { employeeId: id, changedFields: Object.keys(fields).length },
    'Employee profile updated',
  );

  return updated;
}

// ── Emergency Contacts ─────────────────────────────────────────────────────

export async function addContact(
  id: string,
  orgId: string,
  data: Omit<EmergencyContact, '_id'>,
): Promise<User> {
  const updated = await addEmergencyContact(id, orgId, data);
  if (!updated) throw new NotFoundError('Employee');
  return updated;
}

export async function editContact(
  id: string,
  orgId: string,
  contactId: string,
  data: Partial<Omit<EmergencyContact, '_id'>>,
): Promise<User> {
  const updated = await updateEmergencyContact(id, orgId, contactId, data);
  if (!updated) throw new NotFoundError('EmergencyContact');
  return updated;
}

export async function deleteContact(
  id: string,
  orgId: string,
  contactId: string,
): Promise<void> {
  const deleted = await removeEmergencyContact(id, orgId, contactId);
  if (!deleted) throw new NotFoundError('EmergencyContact');
}

// ── Bank Accounts ──────────────────────────────────────────────────────────

export async function addAccount(
  id: string,
  orgId: string,
  data: {
    bankName:      string;
    accountNumber: string;
    clabe:         string;
    isDefault:     boolean;
    documentUrl:   string | null;
  },
) {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  const account = await addBankAccount(id, orgId, data);
  if (!account) throw new NotFoundError('Employee');

  logger.info({ employeeId: id, bankName: data.bankName }, 'Bank account added');

  return account;
}

export async function editAccount(
  id: string,
  orgId: string,
  accountId: string,
  data: { bankName?: string; isDefault?: boolean; documentUrl?: string | null },
): Promise<User> {
  const updated = await updateBankAccount(id, orgId, accountId, data);
  if (!updated) throw new NotFoundError('BankAccount');
  return updated;
}

export async function deleteAccount(
  id: string,
  orgId: string,
  accountId: string,
): Promise<void> {
  const deleted = await removeBankAccount(id, orgId, accountId);
  if (!deleted) throw new NotFoundError('BankAccount');
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function uploadDocument(
  id: string,
  orgId: string,
  file: Express.Multer.File,
  meta: {
    type:       DocumentType;
    name:       string;
    issuedAt:   Date | null;
    expiresAt:  Date | null;
    alertDays:  number;
  },
) {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  // Validar archivo
  validateFile(file.mimetype, file.size);

  // Subir a S3
  const key = generateS3Key('employees', orgId, id, meta.type, file.originalname);
  const upload = await uploadFile(key, file.buffer, file.mimetype);

  // Guardar en MongoDB
  const doc = await addEmployeeDocument(id, orgId, {
    type:             meta.type,
    name:             meta.name,
    fileUrl:          upload.url,
    fileSize:         upload.fileSize,
    mimeType:         upload.mimeType,
    issuedAt:         meta.issuedAt,
    expiresAt:        meta.expiresAt,
    alertDays:        meta.alertDays,
    verifiedAt:       null,
    verifiedBy:       null,
    status:           'pending',
    notes:            null,
    uploadedAt:       new Date(),
    previousVersions: [],
  });

  if (!doc) throw new NotFoundError('Employee');

  logger.info({ employeeId: id, type: meta.type, key }, 'Document uploaded');

  return doc;
}

export async function editDocument(
  id: string,
  orgId: string,
  docId: string,
  fields: {
    status?:     DocumentStatus;
    notes?:      string | null;
    expiresAt?:  Date | null;
    alertDays?:  number;
    verifiedAt?: Date | null;
    verifiedBy?: string | null;
  },
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

  if (!updated) throw new NotFoundError('Document');
  return updated;
}

export async function deleteDocument(
  id: string,
  orgId: string,
  docId: string,
): Promise<void> {
  const result = await removeEmployeeDocument(id, orgId, docId);
  if (!result) throw new NotFoundError('Document');

  // Eliminar de S3 — fire and forget
  const key = extractKeyFromUrl(result.fileUrl);
  deleteFile(key).catch((err) =>
    logger.error({ err, key }, 'Failed to delete document from S3'),
  );

  // Eliminar versiones anteriores de S3
  for (const prevUrl of result.previousVersions) {
    const prevKey = extractKeyFromUrl(prevUrl);
    deleteFile(prevKey).catch((err) =>
      logger.error({ err, prevKey }, 'Failed to delete previous version from S3'),
    );
  }

  logger.info({ employeeId: id, docId }, 'Document deleted');
}

export async function getDocumentUrl(
  id: string,
  orgId: string,
  docId: string,
): Promise<{ url: string; expiresAt: Date }> {
  const employee = await findEmployeeById(id, orgId);
  if (!employee) throw new NotFoundError('Employee');

  const doc = employee.employeeProfile?.documents?.find(
    (d) => d._id.toString() === docId,
  );

  if (!doc) throw new NotFoundError('Document');

  const key = extractKeyFromUrl(doc.fileUrl);
  return getPresignedUrl(key, 3600);
}

// ── Checklist ──────────────────────────────────────────────────────────────

export async function generateChecklist(
  id: string,
  orgId: string,
  employeeType: EmployeeType,
  position: EmployeePosition | null,
): Promise<User> {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  const template = getChecklistTemplate(employeeType, position);
  const currentChecklist = existing.employeeProfile?.checklist ?? [];

  // Solo agregar items que no existen ya
  const existingTypes = new Set(currentChecklist.map((item) => item.type));
  const newItems = template
    .filter((t) => !existingTypes.has(t.type))
    .map((t) => ({
      type:         t.type,
      label:        t.label,
      required:     t.required,
      status:       'pending' as ChecklistStatus,
      documentId:   null,
      waivedBy:     null,
      waivedAt:     null,
      waivedReason: null,
    }));

  if (newItems.length === 0) return existing;

  const updated = await addChecklistItems(id, orgId, newItems);
  if (!updated) throw new NotFoundError('Employee');

  logger.info(
    { employeeId: id, itemsAdded: newItems.length },
    'Checklist generated',
  );

  return updated;
}

export async function addCustomChecklistItem(
  id: string,
  orgId: string,
  data: { type: string; label: string; required: boolean },
): Promise<User> {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  const updated = await addChecklistItems(id, orgId, [
    {
      type:         data.type,
      label:        data.label,
      required:     data.required,
      status:       'pending',
      documentId:   null,
      waivedBy:     null,
      waivedAt:     null,
      waivedReason: null,
    },
  ]);

  if (!updated) throw new NotFoundError('Employee');
  return updated;
}

export async function editChecklistItem(
  id: string,
  orgId: string,
  itemId: string,
  data: {
    required?:     boolean;
    status?:       ChecklistStatus;
    documentId?:   string | null;
    waivedReason?: string | null;
  },
  actorId: string,
): Promise<User> {
  if (data.status === 'waived' && !data.waivedReason) {
    throw new ForbiddenError('waivedReason es requerido al dispensar un item');
  }

  const fields: {
    required?:     boolean;
    status?:       ChecklistStatus;
    documentId?:   ObjectId | null;
    waivedBy?:     ObjectId | null;
    waivedAt?:     Date | null;
    waivedReason?: string | null;
  } = {
    required:     data.required,
    status:       data.status,
    documentId:   data.documentId
      ? new ObjectId(data.documentId)
      : data.documentId === null
        ? null
        : undefined,
    waivedBy:     data.status === 'waived' ? new ObjectId(actorId) : undefined,
    waivedAt:     data.status === 'waived' ? new Date() : undefined,
    waivedReason: data.waivedReason,
  };

  const updated = await updateChecklistItem(id, orgId, itemId, fields);
  if (!updated) throw new NotFoundError('ChecklistItem');
  return updated;
}

export async function deleteChecklistItem(
  id: string,
  orgId: string,
  itemId: string,
): Promise<void> {
  const deleted = await removeChecklistItem(id, orgId, itemId);
  if (!deleted) throw new NotFoundError('ChecklistItem');
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export async function getAuditLog(
  id: string,
  orgId: string,
  filter: { field?: string; from?: Date; to?: Date; limit?: number },
): Promise<AuditLogEntry[]> {
  const existing = await findEmployeeById(id, orgId);
  if (!existing) throw new NotFoundError('Employee');

  return findAuditLog(id, orgId, filter);
}

// ── Checklist stats ────────────────────────────────────────────────────────

export function computeChecklistMeta(
  checklist: User['employeeProfile'] extends null ? never : NonNullable<User['employeeProfile']>['checklist'],
) {
  const total            = checklist.length;
  const complete         = checklist.filter((i) => i.status === 'complete').length;
  const required         = checklist.filter((i) => i.required).length;
  const requiredComplete = checklist.filter(
    (i) => i.required && i.status === 'complete',
  ).length;
  const completion = required > 0
    ? Math.round((requiredComplete / required) * 100)
    : 0;

  return { total, complete, required, requiredComplete, completion };
}