import {ObjectId} from "mongodb";

import {getOrganizationCollection} from "../organizations/organization.model";
import {getUserCollection} from "../users/user.model";
import {findSuperAdmins} from "../users/user.repository";

import {getTaskCollection} from "./task.model";
import type {
	CreateTaskDto,
	PopulatedUser,
	Task,
	TaskDocument,
	TaskQueryFilter,
	UpdateTaskDto,
} from "./task.types";

// ── Helper — poblar usuario ────────────────────────────────────────────────

async function populateUser(
	userId: ObjectId | null,
): Promise<PopulatedUser | null> {
	if (!userId) return null;

	const user = await getUserCollection().findOne(
		{_id: userId},
		{projection: {_id: 1, displayName: 1, email: 1}},
	);

	if (!user) return null;

	return {
		id: user._id.toHexString(),
		displayName: user.displayName,
		email: user.email,
	};
}

// ── Helper — obtener org name ──────────────────────────────────────────────

async function getOrgName(orgId: ObjectId | null): Promise<string | null> {
	if (!orgId) return null;

	const org = await getOrganizationCollection().findOne(
		{_id: orgId},
		{projection: {name: 1}},
	);

	return org?.name ?? null;
}

async function populateUsers(userIds: ObjectId[]): Promise<PopulatedUser[]> {
	if (userIds.length === 0) return [];

	const users = await getUserCollection()
		.find(
			{_id: {$in: userIds}},
			{projection: {_id: 1, displayName: 1, email: 1}},
		)
		.toArray();

	return users.map((u) => ({
		id: u._id.toHexString(),
		displayName: u.displayName,
		email: u.email,
	}));
}

// ── Conversión documento → dominio ─────────────────────────────────────────

async function toTask(
	doc: TaskDocument,
	options: {populateAssignedTo?: boolean; populateParticipants?: boolean} = {},
): Promise<Task> {
	// Poblar todos los usuarios en paralelo
	const [createdBy, assignedTo, assignedBy, orgName] = await Promise.all([
		populateUser(doc.createdBy),
		options.populateAssignedTo
			? populateUser(doc.assignedTo)
			: Promise.resolve(null),
		populateUser(doc.assignedBy ?? null),
		getOrgName(doc.orgId),
	]);

	const participants = options.populateParticipants
		? await populateUsers(doc.participants)
		: [];

	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
		orgName, 
		type: doc.type,
		source: doc.source,
		sourceId: doc.sourceId,
		title: doc.title,
		description: doc.description,
		priority: doc.priority,
		area: doc.area,
		createdBy,
		assignedTo,
		assignedBy,
		participants,
		status: doc.status,
		entity: doc.entity,
		entityId: doc.entityId,
		entityName: doc.entityName,
		dueDate: doc.dueDate,
		resolvedAt: doc.resolvedAt,
		metadata: doc.metadata,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

// ── Deduplicación ──────────────────────────────────────────────────────────

export async function findDuplicateTask(
	sourceId: string,
): Promise<Task | null> {
	const doc = await getTaskCollection().findOne({
		sourceId,
		status: {$in: ["open", "in_progress", "ignored"]},
	});

	if (!doc) return null;

	return toTask(doc as TaskDocument, {populateAssignedTo: true});
}

// ── Crear task ─────────────────────────────────────────────────────────────

export async function createTask(dto: CreateTaskDto): Promise<Task> {
	const now = new Date();

	// Si es error_report o source=system → agregar super_admins como participants
	let extraParticipants: ObjectId[] = [];

	if (dto.type === "error_report" || dto.source === "system") {
		const superAdmins = await findSuperAdmins();
		extraParticipants = superAdmins.map((u) => new ObjectId(u.id));
	}

	const baseParticipants = (dto.participants ?? []).map(
		(id) => new ObjectId(id),
	);

	// Merge sin duplicados
	const allParticipantIds = [
		...new Map(
			[...baseParticipants, ...extraParticipants].map((id) => [
				id.toHexString(),
				id,
			]),
		).values(),
	];

	const doc: Omit<TaskDocument, "_id"> = {
		orgId: dto.orgId ? new ObjectId(dto.orgId) : null,
		type: dto.type,
		source: dto.source,
		sourceId: dto.sourceId ?? null,
		title: dto.title,
		description: dto.description,
		priority: dto.priority,
		area: dto.area,
		createdBy: new ObjectId(dto.createdBy),
		assignedTo: dto.assignedTo ? new ObjectId(dto.assignedTo) : null,
		assignedBy: dto.assignedBy ? new ObjectId(dto.assignedBy) : null,
		participants: allParticipantIds,
		status: dto.status,
		entity: dto.entity,
		entityId: dto.entityId,
		entityName: dto.entityName,
		dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
		resolvedAt: null,
		metadata: dto.metadata ?? {},
		createdAt: now,
		updatedAt: now,
	};

	const result = await getTaskCollection().insertOne(doc as TaskDocument);

	return toTask({_id: result.insertedId, ...doc} as TaskDocument, {
		populateAssignedTo: true,
		populateParticipants: true,
	});
}

// ── Buscar task por ID ─────────────────────────────────────────────────────

export async function findTaskById(id: string): Promise<Task | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getTaskCollection().findOne({
		_id: new ObjectId(id),
	});

	if (!doc) return null;

	return toTask(doc as TaskDocument, {
		populateAssignedTo: true,
		populateParticipants: true,
	});
}

// ── Listar tasks ───────────────────────────────────────────────────────────

export async function findAllTasks(
	filter: TaskQueryFilter,
	accessFilter: Record<string, unknown>,
): Promise<{tasks: Task[]; total: number}> {
	const query: Record<string, unknown> = {...accessFilter};

	if (filter.status) query.status = filter.status;
	if (filter.priority) query.priority = filter.priority;
	if (filter.area) query.area = filter.area;
	if (filter.type) query.type = filter.type;
	if (filter.assignedTo) query.assignedTo = new ObjectId(filter.assignedTo);

	const [docs, total] = await Promise.all([
		getTaskCollection().find(query).sort({createdAt: -1}).toArray(),
		getTaskCollection().countDocuments(query),
	]);

	const tasks = await Promise.all(
		docs.map((doc) =>
			toTask(doc as TaskDocument, {
				populateAssignedTo: true,
				populateParticipants: true,
			}),
		),
	);
	return {tasks, total};
}

// ── Actualizar task ────────────────────────────────────────────────────────

export async function updateTask(
	id: string,
	dto: UpdateTaskDto,
): Promise<Task | null> {
	if (!ObjectId.isValid(id)) return null;

	const setFields: Record<string, unknown> = {
		updatedAt: new Date(),
	};

	if (dto.status !== undefined) {
		setFields.status = dto.status;
		if (dto.status === "resolved") {
			setFields.resolvedAt = new Date();
		}
	}

	if (dto.priority !== undefined) setFields.priority = dto.priority;

	if (dto.assignedTo !== undefined) {
		setFields.assignedTo = dto.assignedTo ? new ObjectId(dto.assignedTo) : null;
	}

	if (dto.participants !== undefined) {
		setFields.participants = dto.participants.map((p) => new ObjectId(p));
	}

	if (dto.dueDate !== undefined) {
		setFields.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
	}

	const result = await getTaskCollection().findOneAndUpdate(
		{_id: new ObjectId(id)},
		{$set: setFields},
		{returnDocument: "after"},
	);

	if (!result) return null;

	return toTask(result as TaskDocument, {
		populateAssignedTo: true,
		populateParticipants: true,
	});
}

// ── Eliminar task ──────────────────────────────────────────────────────────

export async function deleteTask(id: string): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;

	const result = await getTaskCollection().deleteOne({
		_id: new ObjectId(id),
	});

	return result.deletedCount > 0;
}

// ── Buscar task anterior (status previo) ───────────────────────────────────

export async function findTaskDocumentById(
	id: string,
): Promise<TaskDocument | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getTaskCollection().findOne({
		_id: new ObjectId(id),
	});

	return doc as TaskDocument | null;
}
