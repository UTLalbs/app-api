import {ObjectId} from "mongodb";

import {getRedisClient} from "../../../config/redis";
import {getUserCollection} from "../../users/user.model";
import type {User, UserDocument} from "../../users/user.types";

import {
	encryptAccountNumber,
	encryptClabe,
	getLastFour,
} from "./employee.encryption";
import type {
	BankAccount,
	ChecklistItem,
	ChecklistStatus,
	DayOfWeek,
	DayShiftDocument,
	DayShift,
	DocumentStatus,
	EmergencyContact,
	EmployeeDocument,
	EmployeeQueryFilter,
	EmployeeWorkSchedule,
	EmployeeWorkScheduleDocument,
	RenewalFrom,
	ChecklistItemDto,
	EmployeeProfileDocument,
	EmploymentStatus,
	WeeklyPattern,
	WeeklyPatternDocument,
} from "./employee.types";

// ── Proyección base para employees ────────────────────────────────────────

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
	"employeeProfile.position": 1,
	"employeeProfile.department": 1,
	"employeeProfile.managerId": 1,
	"employeeProfile.profileId": 1,
	"employeeProfile.dateOfHire": 1,
	"employeeProfile.employmentStatus": 1,
	"employeeProfile.curp": 1,
	"employeeProfile.rfc": 1,
	"employeeProfile.rfcValidatedAt": 1,
	"employeeProfile.rfcValidatedStatus": 1,
	"employeeProfile.razonSocial": 1,
	"employeeProfile.regimenFiscal": 1,
	"employeeProfile.address": 1,
	"employeeProfile.currentAddress": 1,
	"employeeProfile.emergencyContacts": 1,
	"employeeProfile.vehicleOperator": 1, // ← agregar explícitamente
	"employeeProfile.documents": 1,
	"employeeProfile.checklist": 1,
	"employeeProfile.workSchedule": 1,
	// bankAccounts — solo campos seguros
	"employeeProfile.bankAccounts._id": 1,
	"employeeProfile.bankAccounts.bankName": 1,
	"employeeProfile.bankAccounts.lastFour": 1,
	"employeeProfile.bankAccounts.isDefault": 1,
	"employeeProfile.bankAccounts.documentUrl": 1,
	"employeeProfile.bankAccounts.createdAt": 1,
} as const;

// ── Helper — inicializar arrays del employeeProfile ────────────────────────

export async function initEmployeeArrays(
	id: string,
	orgId: string,
): Promise<void> {
	const setFields: Record<string, unknown> = {};

	// Solo inicializar campos que no existen
	const doc = await getUserCollection().findOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			projection: {
				"employeeProfile.bankAccounts": 1,
				"employeeProfile.emergencyContacts": 1,
				"employeeProfile.documents": 1,
				"employeeProfile.checklist": 1,
			},
		},
	);

	const ep = doc?.employeeProfile;

	if (!Array.isArray(ep?.bankAccounts))
		setFields["employeeProfile.bankAccounts"] = [];
	if (!Array.isArray(ep?.emergencyContacts))
		setFields["employeeProfile.emergencyContacts"] = [];
	if (!Array.isArray(ep?.documents))
		setFields["employeeProfile.documents"] = [];
	if (!Array.isArray(ep?.checklist))
		setFields["employeeProfile.checklist"] = [];
	if (Object.keys(setFields).length > 0) {
		await getUserCollection().updateOne(
			{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
			{$set: setFields},
		);
	}
}

async function populateWaivedBy(
	userId: ObjectId | null,
): Promise<{id: string; displayName: string} | null> {
	if (!userId) return null;

	const user = await getUserCollection().findOne(
		{_id: userId},
		{projection: {_id: 1, displayName: 1}},
	);

	if (!user) return null;

	return {
		id: user._id.toHexString(),
		displayName: user.displayName,
	};
}

async function toChecklistItemDto(
	item: ChecklistItem,
): Promise<ChecklistItemDto> {
	return {
		_id: item._id.toHexString(),
		type: item.type,
		label: item.label,
		required: item.required,
		status: item.status,
		documentId: item.documentId?.toHexString() ?? null,
		hasExpiry: item.hasExpiry,
		alertDays: item.alertDays,
		hasRenewal: item.hasRenewal,
		renewalMonths: item.renewalMonths,
		renewalFrom: item.renewalFrom,
		lastRenewedAt: item.lastRenewedAt,
		waivedBy: await populateWaivedBy(item.waivedBy),
		waivedAt: item.waivedAt,
		waivedReason: item.waivedReason,
		waivedNote: item.waivedNote,
	};
}

// ── Conversión ─────────────────────────────────────────────────────────────

// Normaliza `license.class` legacy (string) a array. Docs creados antes del
// cambio a multi-clase pueden tener `class: "B"`; la API siempre devuelve
// `class: ["B"]` para que el frontend no tenga que ramificar.
function normalizeVehicleOperator<T extends {licenses?: unknown[]} | null | undefined>(
	vo: T,
): T {
	if (!vo || !Array.isArray(vo.licenses)) return vo;
	return {
		...vo,
		licenses: vo.licenses.map((lic) => {
			if (lic && typeof lic === "object" && "class" in lic) {
				const cls = (lic as {class: unknown}).class;
				if (typeof cls === "string") {
					return {...lic, class: [cls]};
				}
			}
			return lic;
		}),
	} as T;
}

// Convierte el subdocumento de workSchedule (Document, con ObjectIds) al
// shape de dominio (strings) que se entrega al frontend.
//
// Defensivo: el campo puede llegar como ObjectId o string dependiendo de la
// ruta de escritura — la PATCH viene del validator Zod como string y se
// persiste tal cual; futuras escrituras desde código pueden traer ObjectId.
function idToHex(value: unknown): string | null {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (value instanceof ObjectId) return value.toHexString();
	// Edge case: BSON deserializa ObjectId-like a un objeto con toHexString().
	if (
		typeof (value as {toHexString?: () => string}).toHexString === "function"
	) {
		return (value as {toHexString: () => string}).toHexString();
	}
	return String(value);
}

function toEmployeeWorkSchedule(
	doc: EmployeeWorkScheduleDocument | null,
): EmployeeWorkSchedule | null {
	if (!doc) return null;

	const days: DayOfWeek[] = [
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
		"sunday",
	];

	const customPattern: WeeklyPattern | null = doc.customPattern
		? (Object.fromEntries(
				days.map((day) => {
					const shift = (doc.customPattern as WeeklyPatternDocument)[day];
					return [
						day,
						shift
							? ({
									...shift,
									startLocationId: idToHex(shift.startLocationId),
									endLocationId: idToHex(shift.endLocationId),
									// Defensivo: docs viejos pueden no tener estos campos.
									breakStartTime: shift.breakStartTime ?? null,
									breakEndTime: shift.breakEndTime ?? null,
								} as DayShift)
							: null,
					];
				}),
			) as WeeklyPattern)
		: null;

	return {
		mode: doc.mode ?? "fixed",
		jornadaType: doc.jornadaType,
		templateId: idToHex(doc.templateId),
		customPattern,
		weeklyMaxHours: doc.weeklyMaxHours,
		restDays: doc.restDays,
		effectiveFrom: doc.effectiveFrom,
		effectiveTo: doc.effectiveTo,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

async function toUser(doc: UserDocument): Promise<User> {
	const ep = doc.employeeProfile;

	// Poblar waivedBy de cada checklist item
	const checklist = await Promise.all(
		(Array.isArray(ep?.checklist) ? ep.checklist : []).map((item) =>
			toChecklistItemDto(item as ChecklistItem),
		),
	);

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
					emergencyContacts: Array.isArray(ep.emergencyContacts)
						? ep.emergencyContacts
						: [],
					bankAccounts: Array.isArray(ep.bankAccounts) ? ep.bankAccounts : [],
					documents: Array.isArray(ep.documents) ? ep.documents : [],
					checklist,
					vehicleOperator: normalizeVehicleOperator(ep.vehicleOperator) ?? null,
					currentAddress: ep.currentAddress ?? {
						sameAsFiscal: true,
						address: null,
					},
					workSchedule: toEmployeeWorkSchedule(ep.workSchedule ?? null),
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
	extraFilter: Record<string, unknown> = {},
): Promise<{employees: User[]; total: number}> {
	const query: Record<string, unknown> = {
		orgId: new ObjectId(orgId),
		"employeeProfile.isEmployee": true,
		...extraFilter,
	};

	if (filter.employmentStatus) {
		// Filtro explícito — mostrar solo ese status
		query["employeeProfile.employmentStatus"] = filter.employmentStatus;
	} else if (
		filter.excludeTerminated === true ||
		filter.excludeTerminated === undefined
	) {
		// Default → excluir terminated
		query["employeeProfile.employmentStatus"] = {$ne: "terminated"};
	}
	// Si excludeTerminated === false → sin filtro → incluir todos

	if (filter.department)
		query["employeeProfile.department"] = filter.department;
	if (filter.position) query["employeeProfile.position"] = filter.position;
	if (filter.driverStatus) {
		query["employeeProfile.vehicleOperator.driverStatus"] = filter.driverStatus;
	}

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
		employees: await Promise.all(
			docs.map((doc) => toUser(doc as UserDocument)),
		),
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
			"employeeProfile.isEmployee": true,
		},
		{projection: EMPLOYEE_PROJECTION},
	);

	return doc ? await toUser(doc as UserDocument) : null;
}

// ── Update profile ─────────────────────────────────────────────────────────

export async function updateEmployeeProfile(
	id: string,
	orgId: string,
	fields: Partial<EmployeeProfileDocument>,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {updatedAt: new Date()};

	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) {
			setFields[`employeeProfile.${key}`] = value;
		}
	}

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.isEmployee": true,
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	return result ? await toUser(result as UserDocument) : null;
}

/**
 * Actualiza solo `vehicleOperator.currentUnitId` sin tocar el resto del
 * sub-objeto (licenses, medicalExam, etc.). Usado por el módulo `units`
 * para mantener sincronía durante el período de doble-modelo (la fuente de
 * verdad migra a `Unit.currentOperatorId`; este campo se deprecará).
 *
 * unitId === null libera al operador.
 */
export async function updateEmployeeCurrentUnit(
	employeeId: string,
	orgId: string,
	unitId: string | null,
): Promise<boolean> {
	if (!ObjectId.isValid(employeeId) || !ObjectId.isValid(orgId)) return false;
	if (unitId !== null && !ObjectId.isValid(unitId)) return false;

	const result = await getUserCollection().updateOne(
		{
			_id: new ObjectId(employeeId),
			orgId: new ObjectId(orgId),
			"employeeProfile.isEmployee": true,
		},
		{
			$set: {
				"employeeProfile.vehicleOperator.currentUnitId": unitId
					? new ObjectId(unitId)
					: null,
				updatedAt: new Date(),
			},
		},
	);

	return result.matchedCount > 0;
}

// ── Update employment status ─────────────────────────────────────────────
export async function updateEmploymentStatus(
	id: string,
	orgId: string,
	status: EmploymentStatus,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const now = new Date();

	const userStatusMap: Record<EmploymentStatus, "active" | "inactive"> = {
		active: "active",
		leave: "inactive",
		vacation: "inactive",
		disability: "inactive",
		suspended: "inactive",
		terminated: "inactive",
	};

	const setFields: Record<string, unknown> = {
		status: userStatusMap[status],
		"employeeProfile.employmentStatus": status,
		updatedAt: now,
	};

	const result = await getUserCollection().findOneAndUpdate(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
		},
		{$set: setFields},
		{returnDocument: "after", projection: EMPLOYEE_PROJECTION},
	);

	// Invalidar cache Redis del usuario afectado
	if (result) {
		await getRedisClient().del(`auth:user:${id}`);
	}

	return result ? await toUser(result as UserDocument) : null;
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

	return result ? await toUser(result as UserDocument) : null;
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

	return result ? await toUser(result as UserDocument) : null;
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

	// Inicializar bankAccounts si no existe
	await getUserCollection().updateOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.bankAccounts": {$exists: false},
		},
		{$set: {"employeeProfile.bankAccounts": []}},
	);

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

	return result ? await toUser(result as UserDocument) : null;
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

	// Verificar si existe documento con mismo type — marcar como reemplazado
	const existing = await getUserCollection().findOne(
		{
			_id: new ObjectId(id),
			orgId: new ObjectId(orgId),
			"employeeProfile.documents.type": doc.type,
		},
		{projection: {"employeeProfile.documents.$": 1}},
	);

	const existingDoc = existing?.employeeProfile?.documents?.[0];

	if (existingDoc) {
		// Marcar documento anterior como reemplazado
		await getUserCollection().updateOne(
			{
				_id: new ObjectId(id),
				orgId: new ObjectId(orgId),
				"employeeProfile.documents._id": existingDoc._id,
			},
			{
				$set: {
					"employeeProfile.documents.$.replacedBy": newDoc._id,
					updatedAt: new Date(),
				},
			},
		);
	}

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
				"employeeProfile.checklist.$.lastRenewedAt": new Date(),
				updatedAt: new Date(),
			},
		},
	);

	// Agregar nuevo documento
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
		issuedAt?: Date | null;
		expiresAt?: Date | null;
		alertDays?: number;
		hasRenewal?: boolean;
		renewalMonths?: number | null;
		renewalFrom?: RenewalFrom;
		renewalStartDate?: Date | null;
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

	return result ? await toUser(result as UserDocument) : null;
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

	return result ? await toUser(result as UserDocument) : null;
}

export async function updateChecklistItem(
	id: string,
	orgId: string,
	itemId: string,
	fields: {
		required?: boolean;
		status?: ChecklistStatus;
		documentId?: ObjectId | null;
		hasExpiry?: boolean;
		alertDays?: number | null;
		hasRenewal?: boolean;
		renewalMonths?: number | null;
		renewalFrom?: RenewalFrom;
		lastRenewedAt?: Date | null;
		waivedBy?: ObjectId | null;
		waivedAt?: Date | null;
		waivedReason?: string | null;
		waivedNote?: string | null;
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

	return result ? await toUser(result as UserDocument) : null;
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
