import {ObjectId} from "mongodb";

import {getLocationTagCollection} from "./location-tag.model";
import type {LocationTag, LocationTagDocument} from "./location.types";

function toLocationTag(doc: LocationTagDocument): LocationTag {
	return {
		id: doc._id.toHexString(),
		orgId: doc.orgId.toHexString(),
		tag: doc.tag,
		isSystem: doc.isSystem,
		usageCount: doc.usageCount,
		lastUsedAt: doc.lastUsedAt,
		createdAt: doc.createdAt,
	};
}

// ── Upsert / increment usage ──────────────────────────────────────────────
// Si el tag no existe, lo crea con usageCount: 1.
// Si existe, incrementa usageCount y actualiza lastUsedAt.

export async function incrementTagUsage(
	orgId: string,
	tag: string,
): Promise<void> {
	const now = new Date();
	await getLocationTagCollection().updateOne(
		{orgId: new ObjectId(orgId), tag},
		{
			$set: {lastUsedAt: now},
			$inc: {usageCount: 1},
			$setOnInsert: {
				orgId: new ObjectId(orgId),
				tag,
				isSystem: false,
				createdAt: now,
			},
		},
		{upsert: true},
	);
}

export async function decrementTagUsage(
	orgId: string,
	tag: string,
): Promise<void> {
	await getLocationTagCollection().updateOne(
		{orgId: new ObjectId(orgId), tag},
		{$inc: {usageCount: -1}},
	);
}

// ── Reconciliar diff de tags entre 2 versiones de una location ────────────

export async function reconcileTagUsage(
	orgId: string,
	prevTags: string[],
	nextTags: string[],
): Promise<void> {
	const prev = new Set(prevTags);
	const next = new Set(nextTags);
	const added = [...next].filter((t) => !prev.has(t));
	const removed = [...prev].filter((t) => !next.has(t));

	await Promise.all([
		...added.map((t) => incrementTagUsage(orgId, t)),
		...removed.map((t) => decrementTagUsage(orgId, t)),
	]);
}

// ── Autocomplete (text match top 10) ──────────────────────────────────────

export async function autocompleteTags(
	orgId: string,
	q: string,
	limit = 10,
): Promise<LocationTag[]> {
	const filter: Record<string, unknown> = {orgId: new ObjectId(orgId)};
	if (q.trim()) {
		filter.tag = {$regex: q, $options: "i"};
	}

	const docs = await getLocationTagCollection()
		.find(filter)
		.sort({isSystem: -1, usageCount: -1, tag: 1})
		.limit(limit)
		.toArray();

	return docs.map((doc) => toLocationTag(doc as LocationTagDocument));
}

// ── Tags populares (top 20: system primero, luego usageCount) ─────────────

export async function getPopularTags(
	orgId: string,
	limit = 20,
): Promise<LocationTag[]> {
	const docs = await getLocationTagCollection()
		.find({orgId: new ObjectId(orgId)})
		.sort({isSystem: -1, usageCount: -1, tag: 1})
		.limit(limit)
		.toArray();

	return docs.map((doc) => toLocationTag(doc as LocationTagDocument));
}

// ── Seed de system tags al crear org ──────────────────────────────────────

export async function seedSystemTags(
	orgId: string,
	tags: string[],
): Promise<void> {
	if (tags.length === 0) return;

	const now = new Date();
	const ops = tags.map((tag) => ({
		updateOne: {
			filter: {orgId: new ObjectId(orgId), tag},
			update: {
				$setOnInsert: {
					orgId: new ObjectId(orgId),
					tag,
					isSystem: true,
					usageCount: 0,
					lastUsedAt: now,
					createdAt: now,
				},
			},
			upsert: true,
		},
	}));

	await getLocationTagCollection().bulkWrite(ops);
}
