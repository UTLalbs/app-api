import {ObjectId} from "mongodb";

import {NotFoundError} from "../../shared/errors/AppError";

import {getUserCollection} from "./user.model";
import type {
	CreateUserDto,
	OAuthIdentity,
	UpdateUserDto,
	User,
	UserDocument,
	UserRole,
	UserStatus,
	UserQueryFilter
} from "./user.types";

// ── Proyección base ────────────────────────────────────────────────────────

const BASE_PROJECTION = {
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
	employeeProfile: 1,
	clientMemberships: 1,
	preferences: 1,
	termsAgreement: 1,
	clientId: 1,
	lastLoginAt: 1,
	createdAt: 1,
	updatedAt: 1,
	"identities.google": 1,
	"identities.microsoft": 1,
} as const;

// ── Conversión documento → dominio ─────────────────────────────────────────

function toUser(doc: UserDocument): User {
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
		employeeProfile: doc.employeeProfile ?? null,
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
			timezone: "America/Mexico_City",
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

export async function findUserById(
	id: string,
	orgId: string,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const filter = orgId
		? {_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null}
		: {_id: new ObjectId(id), deletedAt: null};

	const doc = await getUserCollection().findOne(filter, {
		projection: BASE_PROJECTION,
	});

	return doc ? toUser(doc as UserDocument) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
	const doc = await getUserCollection().findOne(
		{email: email.toLowerCase(), deletedAt: null},
		{projection: BASE_PROJECTION},
	);

	return doc ? toUser(doc as UserDocument) : null;
}

export async function findUserByIdentity(
	provider: "google" | "microsoft",
	sub: string,
): Promise<User | null> {
	const field = `identities.${provider}.sub`;

	const doc = await getUserCollection().findOne(
		{[field]: sub, deletedAt: null},
		{projection: BASE_PROJECTION},
	);

	return doc ? toUser(doc as UserDocument) : null;
}

export async function findAllUsers(
  filter: UserQueryFilter,
  accessFilter: Record<string, unknown>,
): Promise<{ users: User[]; total: number }> {
	const query: Record<string, unknown> = { ...accessFilter, deletedAt: null };
	
	 if (filter.orgId && ObjectId.isValid(filter.orgId)) {
    query.orgId = new ObjectId(filter.orgId);
  }

  if (filter.status)             query.status   = filter.status;
  if (filter.userType)           query.userType = filter.userType;
  if (filter.isGroup !== undefined) query.isGroup = filter.isGroup;

  const [docs, total] = await Promise.all([
    getUserCollection()
      .find(query, { projection: BASE_PROJECTION })
      .sort({ createdAt: -1 })
      .toArray(),
    getUserCollection().countDocuments(query),
  ]);

  return {
    users: docs.map((doc) => toUser(doc as UserDocument)),
    total,
  };
}

export async function findSuperAdmins(): Promise<User[]> {
	const docs = await getUserCollection()
		.find(
			{userType: "super_admin", status: "active", deletedAt: null},
			{projection: BASE_PROJECTION},
		)
		.toArray();

	return docs.map((doc) => toUser(doc as UserDocument));
}

// ── Mutaciones ─────────────────────────────────────────────────────────────

export async function createUser(dto: CreateUserDto): Promise<User> {
	const now = new Date();

	const roles: UserRole[] = (dto.roles ?? []).map((r) => ({
		roleId: new ObjectId(r.roleId),
		name: r.name,
	}));

	const doc: Omit<UserDocument, "_id"> = {
		orgId: dto.orgId ? new ObjectId(dto.orgId) : null,
		userType: dto.userType ?? "internal",
		displayName: dto.displayName,
		firstName: dto.firstName ?? "",
		lastName: dto.lastName ?? "",
		email: dto.email.toLowerCase(),
		isGroup: dto.isGroup ?? false,
		groupAlias: dto.groupAlias ?? null,
		phones: dto.phones ?? [],
		status: "pending",
		roles,
		employeeProfile: dto.employeeProfile ?? null,
		clientMemberships: dto.clientMemberships ?? null,
		identities: {
			local: null,
			google: dto.identities?.google ?? null,
			microsoft: dto.identities?.microsoft ?? null,
		},
		preferences: {
			language: "es",
			timezone: "America/Mexico_City",
			notifications: {push: false},
		},
		termsAgreement: null,
		clientId: dto.clientId ? new ObjectId(dto.clientId) : null,
		lastLoginAt: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	const result = await getUserCollection().insertOne(doc as UserDocument);

	return {
		id: result.insertedId.toHexString(),
		orgId: doc.orgId ? doc.orgId.toHexString() : null,
		userType: doc.userType,
		displayName: doc.displayName,
		firstName: doc.firstName,
		lastName: doc.lastName,
    email: doc.email,
    isGroup: doc.isGroup,
    groupAlias: doc.groupAlias,
		phones: doc.phones,
		status: doc.status,
		roles: roles.map((r) => ({
			roleId: r.roleId.toHexString(),
			name: r.name,
		})),
		employeeProfile: doc.employeeProfile,
		clientMemberships: null,
		identities: {
			google: doc.identities.google as OAuthIdentity | null,
			microsoft: doc.identities.microsoft as OAuthIdentity | null,
		},
		preferences: doc.preferences,
		termsAgreement: null,
		clientId: doc.clientId ? doc.clientId.toHexString() : null,
		lastLoginAt: null,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

export async function updateUser(
	id: string,
	orgId: string,
	dto: UpdateUserDto,
): Promise<User> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const {roles, clientId, employeeProfile, ...rest} = dto;

	const setFields: Record<string, unknown> = {
		...rest,
		updatedAt: new Date(),
	};

	if (roles !== undefined) {
		setFields.roles = roles.map((r) => ({
			roleId: new ObjectId(r.roleId),
			name: r.name,
		}));
	}

	if (clientId !== undefined) {
		setFields.clientId = clientId ? new ObjectId(clientId) : null;
	}

	if (employeeProfile !== undefined) {
		setFields.employeeProfile = employeeProfile;
	}

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{$set: setFields},
		{
			returnDocument: "after",
			projection: BASE_PROJECTION,
		},
	);

	if (!result) throw new NotFoundError("User");

	return toUser(result as UserDocument);
}

export async function updateUserStatus(
	id: string,
	orgId: string,
	status: UserStatus,
	_actorId: string,
): Promise<User> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{$set: {status, updatedAt: new Date()}},
		{returnDocument: "after", projection: BASE_PROJECTION},
	);

	if (!result) throw new NotFoundError("User");

	return toUser(result as UserDocument);
}

export async function linkUserIdentity(
	id: string,
	provider: "google" | "microsoft",
	sub: string,
	email: string,
): Promise<User> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const field = `identities.${provider}`;

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), deletedAt: null},
		{
			$set: {
				[field]: {sub, email, connectedAt: new Date()},
				updatedAt: new Date(),
			},
		},
		{returnDocument: "after", projection: BASE_PROJECTION},
	);

	if (!result) throw new NotFoundError("User");

	return toUser(result as UserDocument);
}

export async function updateUserLastLogin(id: string): Promise<void> {
	if (!ObjectId.isValid(id)) return;

	await getUserCollection().updateOne(
		{_id: new ObjectId(id)},
		{$set: {lastLoginAt: new Date(), updatedAt: new Date()}},
	);
}

export async function softDeleteUser(id: string, orgId: string): Promise<void> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId)},
		{
			$set: {
				deletedAt: new Date(),
				status: "inactive",
				updatedAt: new Date(),
			},
		},
	);
}
