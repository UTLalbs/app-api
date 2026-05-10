import type {Collection} from "mongodb";

import {getDb} from "../../config/database";
import {logger} from "../../config/logger";

import type {UnitDocument} from "./units.types";

export function getUnitCollection(): Collection<UnitDocument> {
	return getDb().collection<UnitDocument>("units");
}

export async function createUnitIndexes(): Promise<void> {
	const collection = getUnitCollection();

	await collection.createIndexes([
		// VIN único por org entre no-eliminados
		{
			key: {orgId: 1, vin: 1},
			name: "orgId_vin_unique",
			unique: true,
			partialFilterExpression: {deletedAt: null},
		},
		// Placa MX única por org entre no-eliminados, solo si existe
		{
			key: {orgId: 1, "plates.mx": 1},
			name: "orgId_plates_mx_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				"plates.mx": {$type: "string"},
			},
		},
		// Placa US única por org entre no-eliminados, solo si existe
		{
			key: {orgId: 1, "plates.us": 1},
			name: "orgId_plates_us_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				"plates.us": {$type: "string"},
			},
		},
		// Número económico único por org entre no-eliminados, solo si existe
		{
			key: {orgId: 1, economicNumber: 1},
			name: "orgId_economicNumber_unique",
			unique: true,
			partialFilterExpression: {
				deletedAt: null,
				economicNumber: {$type: "string"},
			},
		},
		// Listados típicos
		{
			key: {orgId: 1, status: 1, deletedAt: 1},
			name: "orgId_status_deletedAt",
		},
		// Filtro por configuración SAT
		{
			key: {orgId: 1, satConfigCode: 1},
			name: "orgId_satConfigCode",
		},
		// Filtro por tipo de propiedad
		{
			key: {orgId: 1, "ownership.type": 1},
			name: "orgId_ownership_type",
		},
		// FK reverse: units → partner (cascade-block)
		{
			key: {orgId: 1, "ownership.businessPartnerId": 1},
			name: "orgId_ownership_businessPartnerId",
			sparse: true,
		},
		// FK reverse: units → taxId (cascade-block)
		{
			key: {orgId: 1, "ownership.internalTaxIdId": 1},
			name: "orgId_ownership_internalTaxIdId",
			sparse: true,
		},
		// Operador asignado (búsqueda por operador, asegura que un operador
		// no quede asignado activo a 2 unidades). El check estricto se hace
		// en service; este índice acelera la query.
		{
			key: {orgId: 1, currentOperatorId: 1},
			name: "orgId_currentOperatorId",
			sparse: true,
		},
		// Filtro por póliza activa (cuando exista módulo insurance-policies)
		{
			key: {orgId: 1, activePolicyId: 1},
			name: "orgId_activePolicyId",
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

	logger.info("✅  Unit indexes created");
}
