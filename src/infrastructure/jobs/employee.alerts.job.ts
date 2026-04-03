import {type ObjectId} from "mongodb";
import cron from "node-cron";

import {logger} from "../../config/logger";
import {getOrganizationCollection} from "../../modules/organizations/organization.model";
import {submitTask} from "../../modules/tasks/task.service";
import type {TaskPriority} from "../../modules/tasks/task.types";
import {getUserCollection} from "../../modules/users/user.model";
import type {UserDocument} from "../../modules/users/user.types";

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

// ── Procesar un empleado ───────────────────────────────────────────────────

interface AlertCandidate {
	sourceId: string;
	title: string;
	description: string;
	priority: TaskPriority;
	documentType: string;
	expiresAt: Date;
	daysRemaining: number;
}

async function processEmployee(user: UserDocument): Promise<number> {
	const profile = user.employeeProfile;
	if (!profile) return 0;

	const candidates: AlertCandidate[] = [];
	const userId = user._id.toHexString();
	const displayName = user.displayName;

	// ── Licencias ────────────────────────────────────────────────────────────
	const licenses = profile.vehicleOperator?.licenses ?? [];
	for (const license of licenses) {
		if (!license.expiresAt) continue;
		const days = daysUntil(new Date(license.expiresAt));
		const alertDays = license.alertDays ?? 30;
		if (days <= alertDays) {
			const licId =
				(license as unknown as {_id: ObjectId})._id?.toHexString() ?? "unknown";
			candidates.push({
				sourceId: `alert_${userId}_license_${licId}`,
				title: `Licencia ${license.type} por vencer — ${displayName}`,
				description: `La licencia ${license.number} vence el ${new Date(license.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType:
					license.type === "federal" ? "federal_license" : "state_license",
				expiresAt: new Date(license.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── Examen médico SCT ────────────────────────────────────────────────────
	const medical = profile.vehicleOperator?.medicalExam;
	if (medical?.expiresAt) {
		const days = daysUntil(new Date(medical.expiresAt));
		const alertDays = medical.alertDays ?? 30;
		if (days <= alertDays) {
			candidates.push({
				sourceId: `alert_${userId}_medical_exam`,
				title: `Examen médico SCT por vencer — ${displayName}`,
				description: `El examen médico vence el ${new Date(medical.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: "sct_medical_exam",
				expiresAt: new Date(medical.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── Pasaporte ────────────────────────────────────────────────────────────
	const passport = profile.vehicleOperator?.passport;
	if (passport?.expiresAt) {
		const days = daysUntil(new Date(passport.expiresAt));
		const alertDays = passport.alertDays ?? 30;
		if (days <= alertDays) {
			candidates.push({
				sourceId: `alert_${userId}_passport`,
				title: `Pasaporte por vencer — ${displayName}`,
				description: `El pasaporte vence el ${new Date(passport.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: "passport",
				expiresAt: new Date(passport.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── Visa ─────────────────────────────────────────────────────────────────
	const visa = profile.vehicleOperator?.visa;
	if (visa?.expiresAt) {
		const days = daysUntil(new Date(visa.expiresAt));
		const alertDays = visa.alertDays ?? 30;
		if (days <= alertDays) {
			candidates.push({
				sourceId: `alert_${userId}_visa`,
				title: `Visa ${visa.type} por vencer — ${displayName}`,
				description: `La visa vence el ${new Date(visa.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: "visa",
				expiresAt: new Date(visa.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── FAST Card ────────────────────────────────────────────────────────────
	const fastCard = profile.vehicleOperator?.fastCard;
	if (fastCard?.expiresAt) {
		const days = daysUntil(new Date(fastCard.expiresAt));
		const alertDays = fastCard.alertDays ?? 30;
		if (days <= alertDays) {
			candidates.push({
				sourceId: `alert_${userId}_fast_card`,
				title: `FAST Card por vencer — ${displayName}`,
				description: `La FAST Card vence el ${new Date(fastCard.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: "fast_card",
				expiresAt: new Date(fastCard.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── DOT Physical ─────────────────────────────────────────────────────────
	const dotPhysical = profile.vehicleOperator?.fmcsa?.dotPhysical;
	if (dotPhysical?.expiresAt) {
		const days = daysUntil(new Date(dotPhysical.expiresAt));
		const alertDays = dotPhysical.alertDays ?? 30;
		if (days <= alertDays) {
			candidates.push({
				sourceId: `alert_${userId}_dot_physical`,
				title: `DOT Physical por vencer — ${displayName}`,
				description: `El DOT Physical vence el ${new Date(dotPhysical.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: "dot_physical",
				expiresAt: new Date(dotPhysical.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── Documentos con expiresAt ──────────────────────────────────────────────
	const documents = profile.documents ?? [];
	for (const doc of documents) {
		if (!doc.expiresAt || doc.status === "expired") continue;
		const days = daysUntil(new Date(doc.expiresAt));
		const alertDays = doc.alertDays ?? 30;
		if (days <= alertDays) {
			const docId =
				(doc as unknown as {_id: ObjectId})._id?.toHexString() ?? "unknown";
			candidates.push({
				sourceId: `alert_${userId}_doc_${docId}`,
				title: `${doc.name} por vencer — ${displayName}`,
				description: `El documento "${doc.name}" vence el ${new Date(doc.expiresAt).toLocaleDateString("es-MX")}. Quedan ${days} días.`,
				priority: getPriority(days),
				documentType: doc.type,
				expiresAt: new Date(doc.expiresAt),
				daysRemaining: days,
			});
		}
	}

	// ── Crear tasks para cada alerta ──────────────────────────────────────────
	let created = 0;

	for (const candidate of candidates) {
		try {
			const {isDuplicate} = await submitTask(
				{
					orgId: user.orgId ? user.orgId.toHexString() : null,
					type: "license_expiry",
					source: "automatic",
					sourceId: candidate.sourceId,
					title: candidate.title,
					description: candidate.description,
					priority: candidate.priority,
					area: "hr",
					createdBy: SYSTEM_ACTOR_ID, // ← sistema crea
					assignedTo: profile.managerId
						? profile.managerId.toHexString()
						: null,
					assignedBy: profile.managerId ? SYSTEM_ACTOR_ID : null, // ← sistema asigna
					participants: [userId],
					status: "open",
					entity: "Employee",
					entityId: userId,
					entityName: displayName,
					dueDate: candidate.expiresAt.toISOString(),
					metadata: {
						documentType: candidate.documentType,
						expiresAt: candidate.expiresAt,
						daysRemaining: candidate.daysRemaining,
					},
				},
				SYSTEM_ACTOR_NAME,
			);

			if (!isDuplicate) created++;
		} catch (err) {
			logger.error(
				{err, sourceId: candidate.sourceId},
				"Failed to create alert task",
			);
		}
	}

	return created;
}

// ── Job principal ──────────────────────────────────────────────────────────

export async function runEmployeeAlertsJob(): Promise<void> {
	logger.info("🔔 Employee alerts job started");

	try {
		// Obtener todas las organizaciones activas
		const orgs = await getOrganizationCollection()
			.find({status: "active", deletedAt: null})
			.project({_id: 1})
			.toArray();

		let totalCreated = 0;
		let totalChecked = 0;

		for (const org of orgs) {
			// Obtener empleados activos de la org
			const employees = (await getUserCollection()
				.find({
					orgId: org._id,
					deletedAt: null,
					"employeeProfile.isEmployee": true,
					"employeeProfile.employmentStatus": "active",
				})
				.toArray()) as UserDocument[];

			for (const employee of employees) {
				const created = await processEmployee(employee);
				totalCreated += created;
				totalChecked++;
			}
		}

		logger.info(
			{totalChecked, totalCreated},
			"✅ Employee alerts job complete",
		);
	} catch (err) {
		logger.error({err}, "❌ Employee alerts job failed");
	}
}

// ── Registrar cron ─────────────────────────────────────────────────────────

export function registerEmployeeAlertsJob(): void {
	// Ejecutar diariamente a las 8:00 AM
	cron.schedule("0 8 * * *", () => {
		runEmployeeAlertsJob().catch((err) =>
			logger.error({err}, "Employee alerts cron failed"),
		);
	});

	logger.info("✅  Employee alerts job registered — runs daily at 8:00 AM");
}
