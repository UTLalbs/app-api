import type {ObjectId} from "mongodb";

// ── Enums ──────────────────────────────────────────────────────────────────

export type TaskType =
	| "error_report"
	| "maintenance_report"
	| "invoice_issue"
	| "license_expiry"
	| "fuel_alert"
	| "custom";

export type TaskSource = "system" | "user" | "automatic";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskArea =
	| "development"
	| "maintenance"
	| "administration"
	| "hr"
	| "logistics"
	| "fuel";
export type TaskStatus =
	| "open"
	| "in_progress"
	| "resolved"
	| "ignored"
	| "cancelled";

// ── Populated user (para assignedTo y participants) ────────────────────────

export interface PopulatedUser {
	id: string;
	displayName: string;
	email: string;
}

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface TaskDocument {
	_id: ObjectId;
	orgId: ObjectId | null;
	type: TaskType;
	source: TaskSource;
	sourceId: string | null;
	title: string;
	description: string;
	priority: TaskPriority;
	area: TaskArea;
	createdBy: ObjectId;
	assignedTo: ObjectId | null;
	assignedBy: ObjectId | null;
	participants: ObjectId[];
	status: TaskStatus;
	entity: string;
	entityId: string;
	entityName: string;
	dueDate: Date | null;
	resolvedAt: Date | null;
	metadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Task {
	id: string;
	orgId: string | null;
	orgName: string | null;
	type: TaskType;
	source: TaskSource;
	sourceId: string | null;
	title: string;
	description: string;
	priority: TaskPriority;
	area: TaskArea;
	createdBy: PopulatedUser | null;
	assignedTo: PopulatedUser | null;
	assignedBy: PopulatedUser | null;
	participants: PopulatedUser[];
	status: TaskStatus;
	entity: string;
	entityId: string;
	entityName: string;
	dueDate: Date | null;
	resolvedAt: Date | null;
	metadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────
export interface CreateTaskDto {
	orgId: string | null;
	type: TaskType;
	source: TaskSource;
	sourceId?: string | null;
	title: string;
	description: string;
	priority: TaskPriority;
	area: TaskArea;
	createdBy: string;
	assignedTo?: string | null;
	assignedBy?: string | null;
	participants?: string[];
	status: TaskStatus;
	entity: string;
	entityId: string;
	entityName: string;
	dueDate?: string | null;
	metadata?: Record<string, unknown>;
}

export interface UpdateTaskDto {
	status?: TaskStatus;
	priority?: TaskPriority;
	assignedTo?: string | null;
	participants?: string[];
	dueDate?: string | null;
}

export interface TaskQueryFilter {
	status?: TaskStatus;
	priority?: TaskPriority;
	area?: TaskArea;
	type?: TaskType;
	assignedTo?: string;
}
