import type {Collection} from "mongodb";

import {getDb} from "../../config/database";
import {logger} from "../../config/logger";

import type {TrailerDocument} from "./trailers.types";

export function getTrailerCollection(): Collection<TrailerDocument> {
	return getDb().collection<TrailerDocument>("trailers");
}

export async function createTrailerIndexes(): Promise<void> {
	const collection = getTrailerCollection();

	await collection.createIndexes([
		// VIN único por org entre no-eliminados (V1)
		{
			key: {orgId: 1, vin: 1},
			name: "orgId_vin_unique",
			unique: true,
			partialFilterExpression: {deletedAt: null},
		},
		// Placa MX única por org entre no-eliminados, solo si existe (V3)
		{
			key: {orgId: 1, "plates.mx": 1},
			name: "orgId_plates_mx_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				"plates.mx": {$type: "string"},
			},
		},
		// Placa US única por org entre no-eliminados, solo si existe (V4)
		{
			key: {orgId: 1, "plates.us": 1},
			name: "orgId_plates_us_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				"plates.us": {$type: "string"},
			},
		},
		// Número económico único por org entre no-eliminados, solo si existe (V6)
		{
			key: {orgId: 1, economicNumber: 1},
			name: "orgId_economicNumber_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				economicNumber: {$type: "string"},
			},
		},
		// Listados típicos: status + soft delete
		{
			key: {orgId: 1, status: 1, deletedAt: 1},
			name: "orgId_status_deletedAt",
		},
		// Filtro por subtipo
		{
			key: {orgId: 1, ctrSubtype: 1},
			name: "orgId_ctrSubtype",
		},
		// Filtro por tipo de propiedad
		{
			key: {orgId: 1, "ownership.type": 1},
			name: "orgId_ownership_type",
		},
		// FK reverse: trailers que apuntan a un partner (cascade-block)
		{
			key: {orgId: 1, "ownership.businessPartnerId": 1},
			name: "orgId_ownership_businessPartnerId",
			sparse: true,
		},
		// FK reverse: trailers que apuntan a un taxId (cascade-block)
		{
			key: {orgId: 1, "ownership.internalTaxIdId": 1},
			name: "orgId_ownership_internalTaxIdId",
			sparse: true,
		},
		// Lookup de un documento por id (multikey sobre el array embebido)
		{
			key: {orgId: 1, "documents._id": 1},
			name: "orgId_documents_id",
			sparse: true,
		},
		// Job de alertas: docs por vencer (multikey con expiresAt)
		{
			key: {orgId: 1, "documents.expiresAt": 1},
			name: "orgId_documents_expiresAt",
			sparse: true,
		},
	]);

	logger.info("✅  Trailer indexes created");
}
