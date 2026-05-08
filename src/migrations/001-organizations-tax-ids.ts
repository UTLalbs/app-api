import {ObjectId} from "mongodb";

import {getDb} from "../config/database";
import {logger} from "../config/logger";

import type {Migration} from "./index";

/**
 * Migra `organizations.fiscalData` (un solo RFC) a `organizations.fiscalData.taxIds[]`
 * (arreglo multi-RFC).
 *
 * Idempotente: solo opera sobre orgs con `fiscalData.rfc` definido y sin
 * `fiscalData.taxIds`. Si una org ya tiene `taxIds`, se omite.
 *
 * Para preview: `MIGRATION_DRY_RUN=true npm run dev`.
 *
 * Rollback manual (en mongosh):
 *   db.organizations.updateMany(
 *     { 'fiscalData.taxIds': { $exists: true } },
 *     [
 *       { $set: {
 *           'fiscalData.rfc':            { $arrayElemAt: ['$fiscalData.taxIds.rfc', 0] },
 *           'fiscalData.razonSocial':    { $arrayElemAt: ['$fiscalData.taxIds.razonSocial', 0] },
 *           'fiscalData.regimenFiscal':  { $arrayElemAt: ['$fiscalData.taxIds.regimenFiscal', 0] },
 *           'fiscalData.address':        { $arrayElemAt: ['$fiscalData.taxIds.address', 0] },
 *       }},
 *       { $unset: 'fiscalData.taxIds' }
 *     ]
 *   );
 *   db._migrations.deleteOne({ name: '001-organizations-tax-ids' });
 */
async function up(): Promise<void> {
	const db = getDb();
	const collection = db.collection("organizations");

	// Buscar orgs candidatas: las que tienen el shape antiguo.
	const candidates = await collection
		.find({
			"fiscalData.rfc": {$exists: true, $ne: null},
			"fiscalData.taxIds": {$exists: false},
		})
		.toArray();

	if (candidates.length === 0) {
		logger.info("001-organizations-tax-ids — sin candidatas, nada que migrar");
		return;
	}

	logger.info(
		{count: candidates.length},
		"001-organizations-tax-ids — migrando orgs",
	);

	let migrated = 0;

	for (const org of candidates) {
		const oldFiscal = org.fiscalData as
			| {
					rfc?: string;
					razonSocial?: string;
					regimenFiscal?: {code: string; name: string};
					address?: unknown;
					rfcValidatedAt?: Date | null;
					rfcValidatedStatus?: "valid" | "invalid" | null;
			  }
			| null;

		if (!oldFiscal?.rfc) continue;

		const now = new Date();

		const taxIdEntry = {
			_id: new ObjectId(),
			rfc: oldFiscal.rfc,
			razonSocial: oldFiscal.razonSocial ?? "",
			regimenFiscal: oldFiscal.regimenFiscal ?? null,
			address: oldFiscal.address ?? null,
			isDefault: true,
			isActive: true,
			rfcValidatedAt: oldFiscal.rfcValidatedAt ?? null,
			rfcValidatedStatus: oldFiscal.rfcValidatedStatus ?? null,
			createdAt: org.createdAt instanceof Date ? org.createdAt : now,
			updatedAt: now,
		};

		await collection.updateOne(
			{_id: org._id},
			{
				$set: {
					"fiscalData.taxIds": [taxIdEntry],
					updatedAt: now,
				},
				$unset: {
					"fiscalData.rfc": "",
					"fiscalData.razonSocial": "",
					"fiscalData.regimenFiscal": "",
					"fiscalData.address": "",
				},
			},
		);

		migrated++;
	}

	logger.info(
		{migrated, total: candidates.length},
		"001-organizations-tax-ids — completado",
	);
}

export const migration: Migration = {
	name: "001-organizations-tax-ids",
	up,
};
