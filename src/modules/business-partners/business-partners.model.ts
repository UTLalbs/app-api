import type {Collection} from "mongodb";

import {getDb} from "../../config/database";
import {logger} from "../../config/logger";

import type {BusinessPartnerDocument} from "./business-partners.types";

export function getBusinessPartnersCollection(): Collection<BusinessPartnerDocument> {
	return getDb().collection<BusinessPartnerDocument>("businessPartners");
}

export async function createBusinessPartnersIndexes(): Promise<void> {
	const collection = getBusinessPartnersCollection();

	await collection.createIndexes([
		// Soft delete + scope por org
		{key: {orgId: 1, deletedAt: 1}, name: "orgId_deletedAt"},
		// Filtro por estado activo (lo más común en listados)
		{key: {orgId: 1, isActive: 1}, name: "orgId_isActive"},
		// Filtro por rol del partner
		{key: {orgId: 1, roles: 1}, name: "orgId_roles"},
		// RFC único por org entre no-eliminados (solo cuando rfc existe)
		{
			key: {orgId: 1, rfc: 1},
			name: "orgId_rfc_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				rfc: {$type: "string"},
			},
		},
		// foreignTaxId único por org entre no-eliminados (solo cuando existe)
		{
			key: {orgId: 1, foreignTaxId: 1},
			name: "orgId_foreignTaxId_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				foreignTaxId: {$type: "string"},
			},
		},
	]);

	logger.info("✅  Business partner indexes created");
}
