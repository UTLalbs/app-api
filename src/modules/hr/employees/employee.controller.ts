import type {Request, Response} from "express";

import {asyncHandler} from "../../../shared/utils/asyncHandler";

import {
	listEmployees,
	getEmployee,
	editEmployeeProfile,
	addContact,
	editContact,
	deleteContact,
	addAccount,
	editAccount,
	deleteAccount,
	uploadDocument,
	editDocument,
	deleteDocument,
	getDocumentUrl,
	generateChecklist,
	addCustomChecklistItem,
	editChecklistItem,
	deleteChecklistItem,
	computeChecklistMeta,
	changeEmploymentStatus,
} from "./employee.service";
import type {
	EmployeeDepartment,
	EmployeePosition,
	EmployeeProfileDocument,
	EmployeeType,
	RenewalFrom,
	WaivedReason,
	EmploymentStatus,
} from "./employee.types";
import type {
	CreateBankAccountInput,
	CreateChecklistItemInput,
	CreateEmergencyContactInput,
	ListEmployeesInput,
	UpdateBankAccountInput,
	UpdateChecklistItemInput,
	UpdateDocumentInput,
	UpdateEmergencyContactInput,
	UpdateEmployeeProfileInput,
	UploadDocumentInput,
	GenerateChecklistInput,
} from "./employee.validator";

// ── GET /api/v1/employees ──────────────────────────────────────────────────

export const getEmployees = asyncHandler(
	async (req: Request & ListEmployeesInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const {employees, total} = await listEmployees(orgId, {
			search: req.query.search as string | undefined,
			department: req.query.department as EmployeeDepartment | undefined,
			employeeType: req.query.employeeType as EmployeeType | undefined,
			position: req.query.position as EmployeePosition | undefined,
			driverStatus: req.query.driverStatus as
				| "available"
				| "on_trip"
				| "off_duty"
				| undefined,
			employmentStatus: req.query.employmentStatus as
				| EmploymentStatus
				| undefined,
			includeTerminated: req.query.includeTerminated === "true",
		});

		res.json({success: true, data: employees, meta: {total}});
	},
);

// Nuevo handler para cambiar employmentStatus
export const updateEmploymentStatus = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const updated = await changeEmploymentStatus(
			String(req.params.id),
			orgId,
			req.body.employmentStatus as EmploymentStatus,
		);

		res.json({success: true, data: updated});
	},
);

// ── GET /api/v1/employees/:id ──────────────────────────────────────────────

export const getEmployeeById = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const employee = await getEmployee(String(req.params.id), orgId);
		res.json({success: true, data: employee});
	},
);

// ── PATCH /api/v1/employees/:id/profile ───────────────────────────────────

export const updateProfile = asyncHandler(
	async (req: Request & UpdateEmployeeProfileInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await editEmployeeProfile(
			String(req.params.id),
			orgId,
			req.body as unknown as Partial<EmployeeProfileDocument>, // ← cast
			req.user!.id,
		);
		res.json({success: true, data: updated.employeeProfile});
	},
);

// ── Emergency Contacts ─────────────────────────────────────────────────────

export const createEmergencyContact = asyncHandler(
	async (req: Request & CreateEmergencyContactInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await addContact(String(req.params.id), orgId, {
			name: req.body.name,
			relationship: req.body.relationship,
			phone: req.body.phone,
			phoneCode: req.body.phoneCode ?? "+52",
		});
		res.status(201).json({
			success: true,
			data: updated.employeeProfile?.emergencyContacts,
		});
	},
);

export const updateEmergencyContact = asyncHandler(
	async (req: Request & UpdateEmergencyContactInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await editContact(
			String(req.params.id),
			orgId,
			String(req.params.contactId),
			req.body,
		);
		res.json({success: true, data: updated.employeeProfile?.emergencyContacts});
	},
);

export const deleteEmergencyContact = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await deleteContact(
			String(req.params.id),
			orgId,
			String(req.params.contactId),
		);
		res.status(204).send();
	},
);

// ── Bank Accounts ──────────────────────────────────────────────────────────

export const createBankAccount = asyncHandler(
	async (req: Request & CreateBankAccountInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const account = await addAccount(String(req.params.id), orgId, {
			bankName: req.body.bankName,
			accountNumber: req.body.accountNumber,
			clabe: req.body.clabe,
			isDefault: req.body.isDefault ?? false,
			documentUrl: req.body.documentUrl ?? null,
		});
		res.status(201).json({success: true, data: account});
	},
);

export const updateBankAccount = asyncHandler(
	async (req: Request & UpdateBankAccountInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await editAccount(
			String(req.params.id),
			orgId,
			String(req.params.accountId),
			req.body,
		);
		res.json({success: true, data: updated.employeeProfile?.bankAccounts});
	},
);

export const deleteBankAccount = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await deleteAccount(
			String(req.params.id),
			orgId,
			String(req.params.accountId),
		);
		res.status(204).send();
	},
);

// ── Documents ──────────────────────────────────────────────────────────────

export const uploadEmployeeDocument = asyncHandler(
	async (req: Request & UploadDocumentInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		if (!req.file) {
			res.status(400).json({
				success: false,
				error: {code: "VALIDATION_ERROR", message: "No file provided"},
			});
			return;
		}

		const alertDays = Number(req.body.alertDays) || 0;
		const issuedAt = req.body.issuedAt ? new Date(req.body.issuedAt) : null;
		const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

		const doc = await uploadDocument(
			String(req.params.id),
			orgId,
			req.file,
			{
				type: req.body.type,
				name: req.body.name,
				issuedAt,
				expiresAt,
				alertDays,
			},
			req.user!.id,
		);

		res.status(201).json({success: true, data: doc});
	},
);

export const updateEmployeeDocument = asyncHandler(
	async (req: Request & UpdateDocumentInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await editDocument(
			String(req.params.id),
			orgId,
			String(req.params.docId),
			{
				status: req.body.status,
				notes: req.body.notes,
				issuedAt: req.body.issuedAt ? new Date(req.body.issuedAt) : undefined,
				expiresAt: req.body.expiresAt
					? new Date(req.body.expiresAt)
					: undefined,
				alertDays: req.body.alertDays,
				hasRenewal: req.body.hasRenewal,
				renewalMonths: req.body.renewalMonths,
				renewalFrom: req.body.renewalFrom as RenewalFrom | undefined,
				renewalStartDate: req.body.renewalStartDate
					? new Date(req.body.renewalStartDate)
					: undefined,
				verifiedAt: req.body.verifiedAt
					? new Date(req.body.verifiedAt)
					: undefined,
				verifiedBy: req.body.verifiedBy,
			},
			req.user!.id,
		);
		res.json({success: true, data: updated.employeeProfile?.documents});
	},
);

export const deleteEmployeeDocument = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await deleteDocument(
			String(req.params.id),
			orgId,
			String(req.params.docId),
			req.user!.id,
		);
		res.status(204).send();
	},
);

export const getEmployeeDocumentUrl = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const result = await getDocumentUrl(
			String(req.params.id),
			orgId,
			String(req.params.docId),
		);
		res.json({success: true, data: result});
	},
);

// ── Checklist ──────────────────────────────────────────────────────────────

export const getChecklist = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const employee = await getEmployee(String(req.params.id), orgId);
		const checklist = employee.employeeProfile?.checklist ?? [];
		const meta = computeChecklistMeta(checklist);
		res.json({success: true, data: checklist, meta});
	},
);

export const generateEmployeeChecklist = asyncHandler(
	async (req: Request & GenerateChecklistInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";

		const updated = await generateChecklist(
			String(req.params.id),
			orgId,
			req.user!.id,
			req.body.profileId ?? null,
		);

		const checklist = updated.employeeProfile?.checklist ?? [];
		const meta = computeChecklistMeta(checklist);

		res.json({success: true, data: checklist, meta});
	},
);

export const createChecklistItem = asyncHandler(
	async (req: Request & CreateChecklistItemInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await addCustomChecklistItem(
			String(req.params.id),
			orgId,
			req.body,
			req.user!.id,
		);
		res.status(201).json({
			success: true,
			data: updated.employeeProfile?.checklist,
		});
	},
);

export const updateChecklistItem = asyncHandler(
	async (req: Request & UpdateChecklistItemInput, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		const updated = await editChecklistItem(
			String(req.params.id),
			orgId,
			String(req.params.itemId),
			{
				required: req.body.required,
				status: req.body.status,
				waivedReason: req.body.waivedReason as WaivedReason | null | undefined,
				waivedNote: req.body.waivedNote,
				alertDays: req.body.alertDays,
				hasExpiry: req.body.hasExpiry,
				hasRenewal: req.body.hasRenewal,
				renewalMonths: req.body.renewalMonths,
				renewalFrom: req.body.renewalFrom as RenewalFrom | undefined,
				documentId: req.body.documentId,
			},
			req.user!.id,
		);
		res.json({success: true, data: updated.employeeProfile?.checklist});
	},
);

export const deleteChecklistItemHandler = asyncHandler(
	async (req: Request, res: Response) => {
		const orgId = req.user!.impersonating?.orgId ?? req.user!.orgId ?? "";
		await deleteChecklistItem(
			String(req.params.id),
			orgId,
			String(req.params.itemId),
		);
		res.status(204).send();
	},
);
