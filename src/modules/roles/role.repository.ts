import {ObjectId} from "mongodb";

import {NotFoundError} from "../../shared/errors/AppError";

import {getRoleCollection} from "./role.model";
import type {
	CreateRoleDto,
	Role,
	RoleDocument,
	UpdateRoleDto,
} from "./role.types";

// ── Proyección base ────────────────────────────────────────────────────────
const BASE_PROJECTION = {
	_id: 1,
	name: 1,
	description: 1,
	orgId: 1,
	isSystem: 1,
	isOrgAdmin: 1,
	isActive: 1,
	permissions: 1,
	createdAt: 1,
	updatedAt: 1,
} as const;

function toRole(doc: RoleDocument): Role {
	return {
		id: doc._id.toHexString(),
		name: doc.name,
		description: doc.description,
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
		isSystem: doc.isSystem,
		isOrgAdmin: doc.isOrgAdmin ?? false,
		isActive: doc.isActive,
		permissions: doc.permissions,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

export async function findRoleById(id: string): Promise<Role | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getRoleCollection().findOne(
		{_id: new ObjectId(id)},
		{projection: BASE_PROJECTION},
	);

	return doc ? toRole(doc as RoleDocument) : null;
}

export async function findRoleByName(
	name: string,
	orgId: string | null,
): Promise<Role | null> {
	const doc = await getRoleCollection().findOne(
		{
			name,
			orgId: orgId ? new ObjectId(orgId) : null,
		},
		{projection: BASE_PROJECTION},
	);

	return doc ? toRole(doc as RoleDocument) : null;
}

export async function findAllRoles(orgId?: string): Promise<Role[]> {
	// Retorna roles del sistema (orgId: null) + roles de la org si se especifica
	const filter = orgId
		? {$or: [{orgId: null}, {orgId: new ObjectId(orgId)}]}
		: {orgId: null};

	const docs = await getRoleCollection()
		.find(filter, {projection: BASE_PROJECTION})
		.sort({isSystem: -1, name: 1})
		.toArray();

	return docs.map((doc) => toRole(doc as RoleDocument));
}

export async function createRole(dto: CreateRoleDto): Promise<Role> {
	const now = new Date();

	const doc: Omit<RoleDocument, "_id"> = {
		name: dto.name,
		description: dto.description,
		orgId: dto.orgId ? new ObjectId(dto.orgId) : null,
		isSystem: false,
		isOrgAdmin: false,
		isActive: true,
		permissions: dto.permissions,
		createdAt: now,
		updatedAt: now,
	};

	const result = await getRoleCollection().insertOne(doc as RoleDocument);

	return {
		id: result.insertedId.toHexString(),
		...doc,
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
	};
}

export async function updateRole(
	id: string,
	dto: UpdateRoleDto,
): Promise<Role> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("Role");

	const result = await getRoleCollection().findOneAndUpdate(
		{_id: new ObjectId(id), isSystem: false},
		{
			$set: {
				...dto,
				updatedAt: new Date(),
			},
		},
		{
			returnDocument: "after",
			projection: BASE_PROJECTION,
		},
	);

	if (!result) throw new NotFoundError("Role");

	return toRole(result as RoleDocument);
}

export async function deleteRole(id: string): Promise<void> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("Role");

	// Los roles del sistema no se pueden eliminar
	const result = await getRoleCollection().deleteOne({
		_id: new ObjectId(id),
		isSystem: false,
	});

	if (result.deletedCount === 0) throw new NotFoundError("Role");
}
