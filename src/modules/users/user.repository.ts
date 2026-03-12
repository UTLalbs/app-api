import {ObjectId} from "mongodb";

import {logger} from "../../config/logger";
import {ConflictError, NotFoundError} from "../../shared/errors/AppError";

import {getUserCollection} from "./user.model";
import type {
	CreateUserDto,
	UpdateUserDto,
	User,
	UserDocument,
	UserStatus,
} from "./user.types";

// ── Conversión de documento MongoDB a tipo de dominio ─────────────────────
// Esta función es la única que conoce la diferencia entre UserDocument y User
// Se llama en cada método que retorna datos — nunca sale un UserDocument del repository
function toUser(doc: UserDocument): User {
	return {
		id: doc._id.toHexString(),
		email: doc.email,
		displayName: doc.displayName,
		status: doc.status,
		orgId: doc.orgId.toHexString(),
		roles: doc.roles.map((r) => r.toHexString()),
		identities: {
			googleSub: doc.identities.googleSub,
			microsoftOid: doc.identities.microsoftOid,
			// localPasswordHash nunca sale del repository
		},
		lastLoginAt: doc.lastLoginAt,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}

// ── Proyección base — campos que siempre se excluyen en queries normales ──
// passwordHistory y localPasswordHash son sensibles
const BASE_PROJECTION = {
	passwordHistory: 0,
	"identities.localPasswordHash": 0,
} as const;

// ── Métodos del repository ─────────────────────────────────────────────────

export async function findUserById(
	id: string,
	orgId: string,
): Promise<User | null> {
	if (!ObjectId.isValid(id)) return null;

	const doc = await getUserCollection().findOne<UserDocument>(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{projection: BASE_PROJECTION},
	);

	return doc ? toUser(doc) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
	const doc = await getUserCollection().findOne<UserDocument>(
		{email: email.toLowerCase(), deletedAt: null},
		{projection: BASE_PROJECTION},
	);

	return doc ? toUser(doc) : null;
}

export async function findUserByIdentity(
	provider: "google" | "microsoft",
	subjectId: string,
): Promise<User | null> {
	const field =
		provider === "google" ? "identities.googleSub" : "identities.microsoftOid";

	const doc = await getUserCollection().findOne<UserDocument>(
		{[field]: subjectId, deletedAt: null},
		{projection: BASE_PROJECTION},
	);

	return doc ? toUser(doc) : null;
}

export async function findAllUsers(
	orgId: string,
	filter: {status?: UserStatus} = {},
): Promise<User[]> {
	const query = {
		orgId: new ObjectId(orgId),
		deletedAt: null,
		...(filter.status && {status: filter.status}),
	};

	const docs = await getUserCollection()
		.find<UserDocument>(query, {projection: BASE_PROJECTION})
		.toArray();

	return docs.map(toUser);
}

export async function createUser(dto: CreateUserDto): Promise<User> {
	const now = new Date();

	const doc: Omit<UserDocument, "_id"> = {
		email: dto.email.toLowerCase(),
		displayName: dto.displayName,
		status: "pending",
		orgId: new ObjectId(dto.orgId),
		roles: (dto.roles ?? []).map((r) => new ObjectId(r)),
		identities: dto.identities ?? {},
		passwordHistory: [],
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};

	try {
		const result = await getUserCollection().insertOne(doc as UserDocument);

		logger.info({userId: result.insertedId.toHexString()}, "User created");

		// Retornamos el documento completo construyendo el User manualmente
		// para no hacer un findOne extra innecesario
		return toUser({_id: result.insertedId, ...doc} as UserDocument);
	} catch (err: unknown) {
		// Duplicate key — el email ya existe
		if ((err as {code?: number}).code === 11000) {
			throw new ConflictError(`Email ${dto.email} is already registered`);
		}
		throw err;
	}
}

export async function updateUser(
	id: string,
	orgId: string,
	dto: UpdateUserDto,
): Promise<User> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const {roles, ...rest} = dto;

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{
			$set: {
				...rest,
				...(roles && {roles: roles.map((r) => new ObjectId(r))}),
				updatedAt: new Date(),
			},
		},
		{
			returnDocument: "after",
			projection: BASE_PROJECTION,
		},
	);

	if (!result) throw new NotFoundError("User");

	return toUser(result as UserDocument);
}

export async function linkUserIdentity(
	id: string,
	provider: "google" | "microsoft",
	subjectId: string,
): Promise<User> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const field =
		provider === "google" ? "identities.googleSub" : "identities.microsoftOid";

	const result = await getUserCollection().findOneAndUpdate(
		{_id: new ObjectId(id), deletedAt: null},
		{
			$set: {
				[field]: subjectId,
				updatedAt: new Date(),
			},
		},
		{
			returnDocument: "after",
			projection: BASE_PROJECTION,
		},
	);

	if (!result) throw new NotFoundError("User");

	logger.info({userId: id, provider}, "Identity linked to user");

	return toUser(result as UserDocument);
}

export async function updateUserLastLogin(id: string): Promise<void> {
	await getUserCollection().updateOne(
		{_id: new ObjectId(id)},
		{$set: {lastLoginAt: new Date(), updatedAt: new Date()}},
	);
}

export async function softDeleteUser(id: string, orgId: string): Promise<void> {
	if (!ObjectId.isValid(id)) throw new NotFoundError("User");

	const result = await getUserCollection().updateOne(
		{_id: new ObjectId(id), orgId: new ObjectId(orgId), deletedAt: null},
		{$set: {deletedAt: new Date(), updatedAt: new Date()}},
	);

	if (result.matchedCount === 0) throw new NotFoundError("User");

	logger.info({userId: id}, "User soft deleted");
}

// ── Usado internamente por auth — retorna el hash para verificación ────────
// Este es el único método que expone datos sensibles y SOLO lo usa authService
export async function findUserWithPasswordHash(
	email: string,
): Promise<(User & {passwordHash: string | undefined}) | null> {
	const doc = await getUserCollection().findOne<UserDocument>({
		email: email.toLowerCase(),
		deletedAt: null,
	});

	if (!doc) return null;

	return {
		...toUser(doc),
		passwordHash: doc.identities.localPasswordHash,
	};
}
