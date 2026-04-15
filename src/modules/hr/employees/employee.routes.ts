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
} from './employee.controller';
import {
  listEmployeesSchema,
  employeeIdParamSchema,
  updateEmployeeProfileSchema,
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
  authorize('empoyees', 'read'),
  getEmployees,
);

employeeRouter.get(
  '/:id',
  validate(employeeIdParamSchema),
  authorize('empoyees', 'read'),
  getEmployeeById,
);

employeeRouter.patch(
  '/:id/profile',
  validate(updateEmployeeProfileSchema),
  authorize('empoyees', 'update'),
  updateProfile,
);

// ── Emergency Contacts ─────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/emergency-contacts',
  validate(createEmergencyContactSchema),
  authorize('empoyees', 'update'),
  createEmergencyContact,
);

employeeRouter.patch(
  '/:id/emergency-contacts/:contactId',
  validate(updateEmergencyContactSchema),
  authorize('empoyees', 'update'),
  updateEmergencyContact,
);

employeeRouter.delete(
  '/:id/emergency-contacts/:contactId',
  validate(contactIdParamSchema),
  authorize('empoyees', 'update'),
  deleteEmergencyContact,
);

// ── Bank Accounts ──────────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/bank-accounts',
  validate(createBankAccountSchema),
  authorize('empoyees', 'update'),
  createBankAccount,
);

employeeRouter.patch(
  '/:id/bank-accounts/:accountId',
  validate(updateBankAccountSchema),
  authorize('empoyees', 'update'),
  updateBankAccount,
);

employeeRouter.delete(
  '/:id/bank-accounts/:accountId',
  validate(accountIdParamSchema),
  authorize('empoyees', 'delete'),
  deleteBankAccount,
);

// ── Documents ──────────────────────────────────────────────────────────────

employeeRouter.post(
  '/:id/documents',
  upload.single('file'),
  validate(uploadDocumentSchema),
  authorize('empoyees', 'update'),
  uploadEmployeeDocument,
);

employeeRouter.patch(
  '/:id/documents/:docId',
  validate(updateDocumentSchema),
  authorize('empoyees', 'update'),
  updateEmployeeDocument,
);

employeeRouter.delete(
  '/:id/documents/:docId',
  validate(docIdParamSchema),
  authorize('empoyees', 'delete'),
  deleteEmployeeDocument,
);

// GET presigned URL — debe ir ANTES de /:id/documents/:docId
employeeRouter.get(
  '/:id/documents/:docId/url',
  validate(docIdParamSchema),
  authorize('empoyees', 'read'),
  getEmployeeDocumentUrl,
);

// ── Checklist ──────────────────────────────────────────────────────────────

employeeRouter.get(
  '/:id/checklist',
  validate(employeeIdParamSchema),
  authorize('empoyees', 'read'),
  getChecklist,
);

employeeRouter.post(
  '/:id/checklist/generate',
  validate(employeeIdParamSchema),
  authorize('empoyees', 'update'),
  generateEmployeeChecklist,
);

employeeRouter.post(
  '/:id/checklist',
  validate(createChecklistItemSchema),
  authorize('empoyees', 'update'),
  createChecklistItem,
);

employeeRouter.patch(
  '/:id/checklist/:itemId',
  validate(updateChecklistItemSchema),
  authorize('empoyees', 'update'),
  updateChecklistItem,
);

employeeRouter.delete(
  '/:id/checklist/:itemId',
  validate(itemIdParamSchema),
  authorize('empoyees', 'delete'),
  deleteChecklistItemHandler,
);