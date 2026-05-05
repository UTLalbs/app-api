import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { validate } from '../../../middleware/validate';

import
	{
  getEmployees,
  getEmployeeById,
  updateProfile,
  generateScheduleAssignments,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  uploadEmployeeDocument,
  updateEmployeeDocument,
  deleteEmployeeDocument,
  getEmployeeDocumentUrl,
  getChecklist,
  generateEmployeeChecklist,
  createChecklistItem,
  updateChecklistItem,
    deleteChecklistItemHandler,
  updateEmploymentStatus
} from './employee.controller';
import {
  listEmployeesSchema,
  employeeIdParamSchema,
  updateEmployeeProfileSchema,
  generateScheduleAssignmentsSchema,
  createEmergencyContactSchema,
  updateEmergencyContactSchema,
  contactIdParamSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  accountIdParamSchema,
  uploadDocumentSchema,
  updateDocumentSchema,
  docIdParamSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  itemIdParamSchema,
  updateEmploymentStatusSchema,
} from './employee.validator';

// ── Multer — memory storage ────────────────────────────────────────────────
// Los archivos se mantienen en memoria como Buffer
// Se validan y suben a S3 en el service

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const employeeRouter = Router();

employeeRouter.use(authenticate);

// ── Employees ──────────────────────────────────────────────────────────────

employeeRouter.get(
  '/',
  validate(listEmployeesSchema),
  authorize('employees', 'read'),
  getEmployees,
);

employeeRouter.get(
  '/:id',
  validate(employeeIdParamSchema),
  authorize('employees', 'read'),
  getEmployeeById,
);

employeeRouter.patch(
  '/:id/profile',
  validate(updateEmployeeProfileSchema),
  authorize('employees', 'update'),
  updateProfile,
);



// ── Emergency Contacts ─────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/emergency-contacts',
  validate(createEmergencyContactSchema),
  authorize('employees', 'update'),
  createEmergencyContact,
);

employeeRouter.patch(
  '/:id/emergency-contacts/:contactId',
  validate(updateEmergencyContactSchema),
  authorize('employees', 'update'),
  updateEmergencyContact,
);

employeeRouter.delete(
  '/:id/emergency-contacts/:contactId',
  validate(contactIdParamSchema),
  authorize('employees', 'update'),
  deleteEmergencyContact,
);

// ── Employment Status ─────────────────────────────────────────────────────

employeeRouter.patch(
  '/:id/employment-status',
  validate(updateEmploymentStatusSchema),
  authorize('employees', 'update'),
  updateEmploymentStatus,
);

// ── Schedule (workSchedule del empleado → ScheduleAssignment diarios) ─────

employeeRouter.post(
  '/:id/schedule/generate',
  validate(generateScheduleAssignmentsSchema),
  authorize('schedules', 'edit_shifts'),
  generateScheduleAssignments,
);

// ── Bank Accounts ──────────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/bank-accounts',
  validate(createBankAccountSchema),
  authorize('employees', 'update'),
  createBankAccount,
);

employeeRouter.patch(
  '/:id/bank-accounts/:accountId',
  validate(updateBankAccountSchema),
  authorize('employees', 'update'),
  updateBankAccount,
);

employeeRouter.delete(
  '/:id/bank-accounts/:accountId',
  validate(accountIdParamSchema),
  authorize('employees', 'delete'),
  deleteBankAccount,
);

// ── Documents ──────────────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/documents',
  upload.single('file'),
  validate(uploadDocumentSchema),
  authorize('employees', 'update'),
  uploadEmployeeDocument,
);

employeeRouter.patch(
  '/:id/documents/:docId',
  validate(updateDocumentSchema),
  authorize('employees', 'update'),
  updateEmployeeDocument,
);

employeeRouter.delete(
  '/:id/documents/:docId',
  validate(docIdParamSchema),
  authorize('employees', 'delete'),
  deleteEmployeeDocument,
);

// GET presigned URL — debe ir ANTES de /:id/documents/:docId
employeeRouter.get(
  '/:id/documents/:docId/url',
  validate(docIdParamSchema),
  authorize('employees', 'read'),
  getEmployeeDocumentUrl,
);

// ── Checklist ──────────────────────────────────────────────────────────────

employeeRouter.get(
  '/:id/checklist',
  validate(employeeIdParamSchema),
  authorize('employees', 'read'),
  getChecklist,
);

employeeRouter.post(
  '/:id/checklist/generate',
  validate(employeeIdParamSchema),
  authorize('employees', 'update'),
  generateEmployeeChecklist,
);

employeeRouter.post(
  '/:id/checklist',
  validate(createChecklistItemSchema),
  authorize('employees', 'update'),
  createChecklistItem,
);

employeeRouter.patch(
  '/:id/checklist/:itemId',
  validate(updateChecklistItemSchema),
  authorize('employees', 'update'),
  updateChecklistItem,
);

employeeRouter.delete(
  '/:id/checklist/:itemId',
  validate(itemIdParamSchema),
  authorize('employees', 'delete'),
  deleteChecklistItemHandler,
);