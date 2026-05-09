import cron from "node-cron";

import {logger} from "../../config/logger";
import {getOrganizationCollection} from "../../modules/organizations/organization.model";
import {submitTask} from "../../modules/tasks/task.service";
import type {TaskPriority} from "../../modules/tasks/task.types";
import {TRAILER_DOCUMENT_TYPE_CONFIG} from "../../modules/trailers/constants/trailerDocumentTypes.constants";
import {findDocumentsWithExpiry} from "../../modules/trailers/documents/trailer-documents.repository";
import type {TrailerDocument} from "../../modules/trailers/documents/trailer-documents.types";
import type {Trailer} from "../../modules/trailers/trailers.types";
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

function trailerDisplayName(trailer: Trailer): string {
	return trailer.economicNumber || trailer.vin;
}

// ── Procesar un documento ──────────────────────────────────────────────────

async function processDocument(
	doc: TrailerDocument,
	trailer: Trailer,
): Promise<boolean> {
	if (!doc.expiresAt) return false;

	const expiresAt = new Date(doc.expiresAt);
	const days = daysUntil(expiresAt);
	const alertDays = doc.alertDays > 0 ? doc.alertDays : 30;
	if (days > alertDays) return false;

	const config = TRAILER_DOCUMENT_TYPE_CONFIG[doc.type];
	const label = config?.label ?? doc.type;
	const display = trailerDisplayName(trailer);

	const expiredText = days < 0
		? `venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`
		: days === 0
			? "vence hoy"
			: `vence en ${days} día${days === 1 ? "" : "s"}`;

	const title = `${label} ${days < 0 ? "vencida" : "por vencer"} — ${display}`;
	const description = `El documento "${label}" del remolque ${display} ${expiredText} (fecha: ${expiresAt.toLocaleDateString("es-MX")}).`;

	try {
		const {isDuplicate} = await submitTask(
			{
				orgId: doc.orgId,
				type: "trailer_document_expiry",
				source: "automatic",
				sourceId: `alert_trailer_doc_${doc.id}_${expiresAt.toISOString().slice(0, 10)}`,
				title,
				description,
				priority: getPriority(days),
				area: "logistics",
				createdBy: SYSTEM_ACTOR_ID,
				assignedTo: trailer.createdBy ?? null,
				assignedBy: trailer.createdBy ? SYSTEM_ACTOR_ID : null,
				participants: trailer.createdBy ? [trailer.createdBy] : [],
				status: "open",
				entity: "Trailer",
				entityId: trailer.id,
				entityName: display,
				dueDate: expiresAt.toISOString(),
				metadata: {
					trailerDocumentId: doc.id,
					documentType: doc.type,
					expiresAt: expiresAt.toISOString(),
					daysRemaining: days,
				},
			},
			SYSTEM_ACTOR_NAME,
			systemAuditContext("trailer-alerts-job"),
		);

		return !isDuplicate;
	} catch (err) {
		logger.error(
			{err, docId: doc.id, trailerId: trailer.id},
			"Failed to create trailer alert task",
		);
		return false;
	}
}

// ── Job principal ──────────────────────────────────────────────────────────

export async function runTrailerAlertsJob(): Promise<void> {
	logger.info("🔔 Trailer alerts job started");

	try {
		const orgs = await getOrganizationCollection()
			.find({status: "active", deletedAt: null})
			.project({_id: 1})
			.toArray();

		let totalCreated = 0;
		let totalChecked = 0;

		for (const org of orgs) {
			const orgId = org._id.toHexString();
			// findDocumentsWithExpiry retorna pares {document, trailer} ya hidratados.
			const pairs = await findDocumentsWithExpiry(orgId);

			for (const {document, trailer} of pairs) {
				totalChecked++;
				const trailerLite: Trailer = {
					id: trailer._id.toHexString(),
					orgId: trailer.orgId.toHexString(),
					vin: trailer.vin,
					economicNumber: trailer.economicNumber,
					createdBy: trailer.createdBy.toHexString(),
				} as Trailer;
				const created = await processDocument(document, trailerLite);
				if (created) totalCreated++;
			}
		}

		logger.info(
			{totalChecked, totalCreated},
			"✅ Trailer alerts job complete",
		);
	} catch (err) {
		logger.error({err}, "❌ Trailer alerts job failed");
	}
}

// ── Registrar cron ─────────────────────────────────────────────────────────

export function registerTrailerAlertsJob(): void {
	// Diario a las 8:05 AM (5 min después de empleados para no saturar)
	cron.schedule("5 8 * * *", () => {
		runTrailerAlertsJob().catch((err) =>
			logger.error({err}, "Trailer alerts cron failed"),
		);
	});

	logger.info("✅  Trailer alerts job registered — runs daily at 8:05 AM");
}
