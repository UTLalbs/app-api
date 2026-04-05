import {ObjectId} from "mongodb";

import {getUserCollection} from "../users/user.model";
import type {User, UserDocument} from "../users/user.types";

import {
	encryptAccountNumber,
	encryptClabe,
	getLastFour,
} from "./employee.encryption";
import type {
	AuditLogEntry,
	BankAccount,
	ChecklistItem,
	ChecklistStatus,
	DocumentStatus,
	EmergencyContact,
	EmployeeDocument,
	EmployeeProfile,
	EmployeeQueryFilter,
} from "./employee.types";

// ── Proyección base para employees ────────────────────────────────────────
// Excluye auditLog y bankAccounts encriptados por default

const EMPLOYEE_PROJECTION = {
	_id: 1,
	orgId: 1,
	userType: 1,
	displayName: 1,
	firstName: 1,
	lastName: 1,
	email: 1,
	isGroup: 1,
	groupAlias: 1,
	phones: 1,
	status: 1,
	roles: 1,
	preferences: 1,
	clientId: 1,
	lastLoginAt: 1,
	createdAt: 1,
	updatedAt: 1,
	"employeeProfile.isEmployee": 1,
	"employeeProfile.employeeType": 1,
	"employeeProfile.position": 1,
	"employeeProfile.department": 1,
	"employeeProfile.managerId": 1,
	"employeeProfile.dateOfHire": 1,
	"employeeProfile.employmentStatus": 1,
	"employeeProfile.curp": 1,
	"employeeProfile.rfc": 1,
	"employeeProfile.razonSocial": 1,
	"employeeProfile.regimenFiscal": 1,
	"employeeProfile.address": 1,
	"employeeProfile.currentAddress": 1,
	"employeeProfile.emergencyContacts": 1,
	"employeeProfile.vehicleOperator": 1, // ← agregar explícitamente
	"employeeProfile.documents": 1,
	"employeeProfile.checklist": 1,
	// bankAccounts — solo campos seguros
	"employeeProfile.bankAccounts._id": 1,
	"employeeProfile.bankAccounts.bankName": 1,
	"employeeProfile.bankAccounts.lastFour": 1,
	"employeeProfile.bankAccounts.isDefault": 1,
	"employeeProfile.bankAccounts.documentUrl": 1,
	"employeeProfile.bankAccounts.createdAt": 1,
	// auditLog excluido por default
} as const;
// ── Conversión ─────────────────────────────────────────────────────────────

function toUser ( doc: UserDocument ): User
{
	const ep = doc.employeeProfile;

	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
		userType: doc.userType,
		displayName: doc.displayName,
		firstName: doc.firstName,
		lastName: doc.lastName,
		email: doc.email,
		isGroup: doc.isGroup ?? false,
		groupAlias: doc.groupAlias ?? null,
		phones: doc.phones ?? [],
		status: doc.status,
		roles: doc.roles.map((r) => ({
			roleId: r.roleId.toHexString(),
			name: r.name,
		})),
		employeeProfile: ep
      ? {
          ...ep,
          emergencyContacts: Array.isArray(ep.emergencyContacts) ? ep.emergencyContacts : [],
          bankAccounts:      Array.isArray(ep.bankAccounts)      ? ep.bankAccounts      : [],
          documents:         Array.isArray(ep.documents)         ? ep.documents         : [],
          checklist:         Array.isArray(ep.checklist)         ? ep.checklist         : [],
          auditLog:          Array.isArray(ep.auditLog)          ? ep.auditLog          : [],
          vehicleOperator:   ep.vehicleOperator ?? null,
          currentAddress:    ep.currentAddress ?? {
            sameAsFiscal: true,
            address:      null,
          },
        }
      : null,
		clientMemberships: doc.clientMemberships
			? doc.clientMemberships.map((m) => ({
					clientId: m.clientId.toHexString(),
					alias: m.alias,
					access: m.access,
					isDefault: m.isDefault,
				}))
			: null,
		identities: {
			google: doc.identities?.google ?? null,
			microsoft: doc.identities?.microsoft ?? null,
		},
		preferences: doc.preferences ?? {
			language: "es",
			timezone: null,
			notifications: {push: false},
		},
		termsAgreement: doc.termsAgreement ?? null,
		clientId: doc.clientId ? doc.clientId.toHexString() : null,
		lastLoginAt: doc.lastLoginAt ?? null,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function findAllEmployees(
	orgId: string,
	filter: EmployeeQueryFilter,
): Promise<{employees: User[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
		"employeeProfile.isEmployee": true,
	};

	if (filter.department)
		query["employeeProfile.department"] = filter.department;
	if (filter.employeeType)
		query["employeeProfile.employeeType"] = filter.employeeType;
	if (filter.position) query["employeeProfile.position"] = filter.position;
	if (filter.employmentStatus)
		query["employeeProfile.employmentStatus"] = filter.employmentStatus;
	if (filter.driverStatus) {
		query["employeeProfile.vehicleOperator.driverStatus"] = filter.driverStatus;
	}

	// Búsqueda por nombre o email
	if (filter.search) {
		const regex = {$regex: filter.search, $options: "i"};
		query.$or = [
			{displayName: regex},
			{firstName: regex},
			{lastName: regex},
			{email: regex},
		];
	}

	const [docs, total] = await Promise.all([
		getUserCollection()
			.find(query, {projection: EMPLOYEE_PROJECTION})
			.sort({"employeeProfile.employmentStatus": 1, createdAt: -1})
			.toArray(),
		getUserCollection().countDocuments(query),
	]);

	return {
		employees: docs.map((doc) => toUser(doc as UserDocument)),
		total,
	};
}

export async function findEmployeeById(
	id: string,
	orgId: string,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getUserCollection().findOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			deletedAt: null,
			"employeeProfile.isEmployee": true,
		},
		{projection: EMPLOYEE_PROJECTION},
	);

	return doc ? toUser(doc as UserDocument) : null;
}

// ── Update profile ─────────────────────────────────────────────────────────

export async function updateEmployeeProfile(
	id: string,
	orgId: string,
	fields: Partial<EmployeeProfile>,
	auditEntries: AuditLogEntry[],
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	// Mapear cada campo de employeeProfile con $set puntual
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			setFields[`employeeProfile.${key}`] = value;
		}
	}

	const update: Record<string, unknown> = {$set: setFields};

	// Agregar auditLog entries si hay cambios
	if (auditEntries.length > 0) {
		update.$push = {
			"employeeProfile.auditLog": {$each: auditEntries},
		};
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			deletedAt: null,
			"employeeProfile.isEmployee": true,
		},
		update,
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

// ── Emergency Contacts ─────────────────────────────────────────────────────

export async function addEmergencyContact(
	id: string,
	orgId: string,
	contact: Omit<EmergencyContact, "_id">,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const newContact = {_id: new ObjectId(), ...contact};

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{
			$push: {"employeeProfile.emergencyContacts": newContact},
			$set: {updatedAt: new Date()},
		},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function updateEmergencyContact(
	id: string,
	orgId: string,
	contactId: string,
	fields: Partial<Omit<EmergencyContact, "_id">>,
): Promise<User | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(contactId)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			setFields[`employeeProfile.emergencyContacts.$.${key}`] = value;
		}
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.emergencyContacts._id": new ObjectId(contactId),
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function removeEmergencyContact(
	id: string,
	orgId: string,
	contactId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(contactId)) return false;

	const result = await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$pull: {
				"employeeProfile.emergencyContacts": {_id: new ObjectId(contactId)},
			},
			$set: {updatedAt: new Date()},
		},
	);

	return result.modifiedCount > 0;
}

// ── Bank Accounts ──────────────────────────────────────────────────────────

export async function addBankAccount(
	id: string,
	orgId: string,
	data: {
		bankName: string;
		accountNumber: string;
		clabe: string;
		isDefault: boolean;
		documentUrl: string | null;
	},
): Promise<BankAccount | null> {
	if (!ObjectId.isValid(id)) return null;

	const lastFour = getLastFour(data.accountNumber);
	const encryptedAccount = encryptAccountNumber(data.accountNumber);
	const encryptedClabe = encryptClabe(data.clabe);

	const newAccount: BankAccount = {
		_id: new ObjectId(),
		bankName: data.bankName,
		accountNumber: encryptedAccount,
		clabe: encryptedClabe,
		lastFour,
		documentUrl: data.documentUrl,
		isDefault: data.isDefault,
		createdAt: new Date(),
	};

	// Si isDefault → desmarcar las demás
	if (data.isDefault) {
		await getUserCollection().updateOne(
			{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
			{$set: {"employeeProfile.bankAccounts.$[].isDefault": false}},
		);
	}

	await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$push: {"employeeProfile.bankAccounts": newAccount},
			$set: {updatedAt: new Date()},
		},
	);

	// Retornar sin datos encriptados
	return {
		...newAccount,
		accountNumber: "", // no exponer
		clabe: "", // no exponer
	};
}

export async function updateBankAccount(
	id: string,
	orgId: string,
	accountId: string,
	fields: {bankName?: string; isDefault?: boolean; documentUrl?: string | null},
): Promise<User | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(accountId)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	if (fields.bankName !== undefined)
		setFields["employeeProfile.bankAccounts.$.bankName"] = fields.bankName;
	if (fields.documentUrl !== undefined)
		setFields["employeeProfile.bankAccounts.$.documentUrl"] =
			fields.documentUrl;
	if (fields.isDefault !== undefined)
		setFields["employeeProfile.bankAccounts.$.isDefault"] = fields.isDefault;

	if (fields.isDefault) {
		await getUserCollection().updateOne(
			{_id: new ObjectId(id)},
			{$set: {"employeeProfile.bankAccounts.$[].isDefault": false}},
		);
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.bankAccounts._id": new ObjectId(accountId),
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function removeBankAccount(
	id: string,
	orgId: string,
	accountId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(accountId)) return false;

	const result = await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$pull: {"employeeProfile.bankAccounts": {_id: new ObjectId(accountId)}},
			$set: {updatedAt: new Date()},
		},
	);

	return result.modifiedCount > 0;
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function addEmployeeDocument(
	id: string,
	orgId: string,
	doc: Omit<EmployeeDocument, "_id">,
): Promise<EmployeeDocument | null> {
	if (!ObjectId.isValid(id)) return null;

	const newDoc: EmployeeDocument = {_id: new ObjectId(), ...doc};

	// Actualizar checklist si existe item con mismo type
	await getUserCollection().updateOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.checklist.type": doc.type,
		},
		{
			$set: {
				"employeeProfile.checklist.$.status": "complete",
				"employeeProfile.checklist.$.documentId": newDoc._id,
				updatedAt: new Date(),
			},
		},
	);

	await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$push: {"employeeProfile.documents": newDoc},
			$set: {updatedAt: new Date()},
		},
	);

	return newDoc;
}

export async function updateEmployeeDocument(
	id: string,
	orgId: string,
	docId: string,
	fields: {
		status?: DocumentStatus;
		notes?: string | null;
		expiresAt?: Date | null;
		alertDays?: number;
		verifiedAt?: Date | null;
		verifiedBy?: ObjectId | null;
	},
): Promise<User | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(docId)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			setFields[`employeeProfile.documents.$.${key}`] = value;
		}
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.documents._id": new ObjectId(docId),
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function removeEmployeeDocument(
	id: string,
	orgId: string,
	docId: string,
): Promise<{fileUrl: string; previousVersions: string[]} | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(docId)) return null;

	// Obtener fileUrl antes de eliminar
	const user = await getUserCollection().findOne(
		{
			_id: new ObjectId(id),
			"employeeProfile.documents._id": new ObjectId(docId),
		},
		{projection: {"employeeProfile.documents.$": 1}},
	);

	const doc = user?.employeeProfile?.documents?.[0];
	if (!doc) return null;

	const fileUrl = doc.fileUrl;
	const previousVersionUrls = doc.previousVersions.map((v) => v.fileUrl);

	// Resetear checklist item si apuntaba a este documento
	await getUserCollection().updateOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.checklist.documentId": new ObjectId(docId),
		},
		{
			$set: {
				"employeeProfile.checklist.$.status": "pending",
				"employeeProfile.checklist.$.documentId": null,
				updatedAt: new Date(),
			},
		},
	);

	// Eliminar documento del array
	await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$pull: {"employeeProfile.documents": {_id: new ObjectId(docId)}},
			$set: {updatedAt: new Date()},
		},
	);

	return {fileUrl, previousVersions: previousVersionUrls};
}

// ── Checklist ──────────────────────────────────────────────────────────────

export async function addChecklistItems(
	id: string,
	orgId: string,
	items: Omit<ChecklistItem, "_id">[],
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const newItems = items.map((item) => ({_id: new ObjectId(), ...item}));

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$push: {"employeeProfile.checklist": {$each: newItems}},
			$set: {updatedAt: new Date()},
		},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function updateChecklistItem(
	id: string,
	orgId: string,
	itemId: string,
	fields: {
		required?: boolean;
		status?: ChecklistStatus;
		documentId?: ObjectId | null;
		waivedBy?: ObjectId | null;
		waivedAt?: Date | null;
		waivedReason?: string | null;
	},
): Promise<User | null> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(itemId)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			setFields[`employeeProfile.checklist.$.${key}`] = value;
		}
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.checklist._id": new ObjectId(itemId),
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? toUser(result as UserDocument) : null;
}

export async function removeChecklistItem(
	id: string,
	orgId: string,
	itemId: string,
): Promise<boolean> {
	if (!ObjectId.isValid(id) || !ObjectId.isValid(itemId)) return false;

	const result = await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$pull: {"employeeProfile.checklist": {_id: new ObjectId(itemId)}},
			$set: {updatedAt: new Date()},
		},
	);

	return result.modifiedCount > 0;
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export async function findAuditLog(
	id: string,
	orgId: string,
	filter: {field?: string; from?: Date; to?: Date; limit?: number},
): Promise<AuditLogEntry[]> {
	if (!ObjectId.isValid(id)) return [];

	const doc = await getUserCollection().findOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{projection: {"employeeProfile.auditLog": 1}},
	);

	let entries = doc?.employeeProfile?.auditLog ?? [];

	if (filter.field) {
		entries = entries.filter((e) => e.field === filter.field);
	}

	if (filter.from) {
		entries = entries.filter((e) => e.changedAt >= filter.from!);
	}

	if (filter.to) {
		entries = entries.filter((e) => e.changedAt <= filter.to!);
	}

	// Ordenar desc y limitar
	return entries
		.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
		.slice(0, filter.limit ?? 50);
}

// ── Helpers para alertas (cron job) ───────────────────────────────────────

export async function findActiveEmployeesWithExpirations(
	orgId: string,
): Promise<UserDocument[]> {
	const docs = await getUserCollection()
		.find(
			{
				orgId: new ObjectId(orgId),
				deletedAt: null,
				"employeeProfile.isEmployee": true,
				"employeeProfile.employmentStatus": "active",
			},
			{
				projection: {
					_id: 1,
					orgId: 1,
					displayName: 1,
					"employeeProfile.managerId": 1,
					"employeeProfile.vehicleOperator": 1,
					"employeeProfile.documents": 1,
				},
			},
		)
		.toArray();

	return docs as UserDocument[];
}
