import {getDb} from "../config/database";
import {logger} from "../config/logger";

import {migrations, type Migration} from "./index";

export interface MigrationRecord {
	name: string;
	appliedAt: Date;
}

const COLLECTION = "_migrations";

/**
 * Aplica todas las migraciones pendientes en orden.
 *
 * Idempotente: cada migración se registra en la colección `_migrations` con
 * `{name, appliedAt}`. Migraciones ya aplicadas se omiten.
 *
 * Si la variable `MIGRATION_DRY_RUN=true` está presente, lista las migraciones
 * que se aplicarían sin tocar datos.
 */
export async function runPendingMigrations(): Promise<void> {
	const db = getDb();
	const collection = db.collection<MigrationRecord>(COLLECTION);

	const applied = await collection.find({}).toArray();
	const appliedNames = new Set(applied.map((m) => m.name));

	const pending = migrations.filter((m) => !appliedNames.has(m.name));

	if (pending.length === 0) {
		logger.info("✅  No pending migrations");
		return;
	}

	const dryRun = process.env.MIGRATION_DRY_RUN === "true";

	if (dryRun) {
		logger.warn(
			{pending: pending.map((m) => m.name)},
			"🚧  MIGRATION_DRY_RUN — would apply these migrations",
		);
		return;
	}

	logger.info(
		{pending: pending.map((m) => m.name)},
		"🚀  Applying pending migrations",
	);

	for (const migration of pending) {
		await applyOne(migration);
	}

	logger.info(
		{count: pending.length},
		"✅  All pending migrations applied",
	);
}

async function applyOne(migration: Migration): Promise<void> {
	const db = getDb();
	const collection = db.collection<MigrationRecord>(COLLECTION);

	logger.info({name: migration.name}, "▶  Applying migration");

	const startedAt = Date.now();

	try {
		await migration.up();
	} catch (err) {
		logger.error(
			{err, name: migration.name},
			"❌  Migration failed — aborting boot",
		);
		throw err;
	}

	await collection.insertOne({
		name: migration.name,
		appliedAt: new Date(),
	});

	logger.info(
		{name: migration.name, durationMs: Date.now() - startedAt},
		"✓  Migration applied",
	);
}
