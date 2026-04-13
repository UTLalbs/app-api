import type {ObjectId} from "mongodb";

export interface DocumentProfileDocument {
	_id: ObjectId;
	orgId: ObjectId;
	name: string;
	description: string | null;
	documentTypes: string[];
	createdBy: ObjectId;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentProfile {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	documentTypes: string[];
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateDocumentProfileDto {
	orgId: string;
	name: string;
	description: string | null;
	documentTypes: string[];
	createdBy: string;
}

export interface UpdateDocumentProfileDto {
	name?: string;
	description?: string | null;
	documentTypes?: string[];
}
