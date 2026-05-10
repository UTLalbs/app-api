import cron from "node-cron";

import {logger} from "../../config/logger";
import {getOrganizationCollection} from "../../modules/organizations/organization.model";
import {submitTask} from "../../modules/tasks/task.service";
import type {TaskPriority} from "../../modules/tasks/task.types";
import {UNIT_DOCUMENT_TYPE_CONFIG} from "../../modules/units/constants/unitDocumentTypes.constants";
import {findDocumentsWithExpiry} from "../../modules/units/documents/unit-documents.repository";
import type {UnitDocument} from "../../modules/units/documents/unit-documents.types";
import type {Unit} from "../../modules/units/units.types";
import {systemAuditContext} from "../../shared/utils/auditContext";

// ── Config ─────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR_NAME = "Sistema";
const SYSTEM_ACTOR_ID = "000000000000000000000000";

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(date: Date): number {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const diff = date.getTime() - now.getTime();
	return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getPriority(daysRemaining: number): TaskPriority {
	if (daysRemaining < 0) return "critical";
	if (daysRemaining <= 7) return "critical";
	if (daysRemaining <= 15) return "high";
	if (daysRemaining <= 30) return "medium";
	return "low";
}

function unitDisplayName(unit: Unit): string {
	return unit.economicNumber || unit.vin;
}

// ── Procesar un documento ──────────────────────────────────────────────────

async function processDocument(doc: UnitDocument, unit: Unit): Promise<boolean> {
	if (!doc.expiresAt) return false;

	const expiresAt = new Date(doc.expiresAt);
	const days = daysUntil(expiresAt);
	const alertDays = doc.alertDays > 0 ? doc.alertDays : 30;
	if (days > alertDays) return false;

	const config = UNIT_DOCUMENT_TYPE_CONFIG[doc.type];
	const label = config?.label ?? doc.type;
	const display = unitDisplayName(unit);

	const expiredText =
		days < 0
			? `venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`
			: days === 0
				? "vence hoy"
				: `vence en ${days} día${days === 1 ? "" : "s"}`;

	const title = `${label} ${days < 0 ? "vencida" : "por vencer"} — ${display}`;
	const description = `El documento "${label}" de la unidad ${display} ${expiredText} (fecha: ${expiresAt.toLocaleDateString("es-MX")}).`;

	try {
		const {isDuplicate} = await submitTask(
			{
				orgId: doc.orgId,
				type: "unit_document_expiry",
				source: "automatic",
				sourceId: `alert_unit_doc_${doc.id}_${expiresAt.toISOString().slice(0, 10)}`,
				title,
				description,
				priority: getPriority(days),
				area: "logistics",
				createdBy: SYSTEM_ACTOR_ID,
				assignedTo: unit.createdBy ?? null,
				assignedBy: unit.createdBy ? SYSTEM_ACTOR_ID : null,
				participants: unit.createdBy ? [unit.createdBy] : [],
				status: "open",
				entity: "Unit",
				entityId: unit.id,
				entityName: display,
				dueDate: expiresAt.toISOString(),
				metadata: {
					unitDocumentId: doc.id,
					documentType: doc.type,
					expiresAt: expiresAt.toISOString(),
					daysRemaining: days,
				},
			},
			SYSTEM_ACTOR_NAME,
			systemAuditContext("unit-alerts-job"),
		);

		return !isDuplicate;
	} catch (err) {
		logger.error(
			{err, docId: doc.id, unitId: unit.id},
			"Failed to create unit alert task",
		);
		return false;
	}
}

// ── Job principal ──────────────────────────────────────────────────────────

export async function runUnitAlertsJob(): Promise<void> {
	logger.info("🔔 Unit alerts job started");

	try {
		const orgs = await getOrganizationCollection()
			.find({status: "active", deletedAt: null})
			.project({_id: 1})
			.toArray();

		let totalCreated = 0;
		let totalChecked = 0;

		for (const org of orgs) {
			const orgId = org._id.toHexString();
			const pairs = await findDocumentsWithExpiry(orgId);

			for (const {document, unit} of pairs) {
				totalChecked++;
				const unitLite: Unit = {
					id: unit._id.toHexString(),
					orgId: unit.orgId.toHexString(),
					vin: unit.vin,
					economicNumber: unit.economicNumber,
					createdBy: unit.createdBy.toHexString(),
				} as Unit;
				const created = await processDocument(document, unitLite);
				if (created) totalCreated++;
			}
		}

		logger.info({totalChecked, totalCreated}, "✅ Unit alerts job complete");
	} catch (err) {
		logger.error({err}, "❌ Unit alerts job failed");
	}
}

// ── Registrar cron ─────────────────────────────────────────────────────────

export function registerUnitAlertsJob(): void {
	// Diario a las 8:10 AM (5 min después del de trailers para no saturar)
	cron.schedule("10 8 * * *", () => {
		runUnitAlertsJob().catch((err) =>
			logger.error({err}, "Unit alerts cron failed"),
		);
	});

	logger.info("✅  Unit alerts job registered — runs daily at 8:10 AM");
}
