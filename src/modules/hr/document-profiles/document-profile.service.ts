import {logger} from "../../../config/logger";
import {ConflictError, NotFoundError} from "../../../shared/errors/AppError";

import {
	findAllDocumentProfiles,
	findDocumentProfileById,
	findDocumentProfileByName,
	createDocumentProfile,
	updateDocumentProfile,
	deleteDocumentProfile,
} from "./document-profile.repository";
import type {
	DocumentProfile,
	UpdateDocumentProfileDto,
	DocumentTypeEntry,
} from "./document-profile.types";

export async function listDocumentProfiles(
	orgId: string,
): Promise<DocumentProfile[]> {
	return findAllDocumentProfiles(orgId);
}

export async function createDocumentProfileItem(
	orgId: string,
	actorId: string,
	data: {
		name: string;
		description: string | null;
		documentTypes: DocumentTypeEntry[];
	},
): Promise<DocumentProfile> {
	const existing = await findDocumentProfileByName(orgId, data.name);
	if (existing) {
		throw new ConflictError(`Ya existe un perfil con el nombre "${data.name}"`);
	}

	const profile = await createDocumentProfile({
		orgId,
		name: data.name,
		description: data.description,
		documentTypes: data.documentTypes,
		createdBy: actorId,
	});

	logger.info({orgId, profileId: profile.id}, "Document profile created");

	return profile;
}

export async function editDocumentProfile(
	id: string,
	orgId: string,
	dto: UpdateDocumentProfileDto,
): Promise<DocumentProfile> {
	const existing = await findDocumentProfileById(id, orgId);
	if (!existing) throw new NotFoundError("DocumentProfile");

	// Verificar nombre único si cambia
	if (dto.name && dto.name !== existing.name) {
		const conflict = await findDocumentProfileByName(orgId, dto.name);
		if (conflict) {
			throw new ConflictError(
				`Ya existe un perfil con el nombre "${dto.name}"`,
			);
		}
	}

	const updated = await updateDocumentProfile(id, orgId, dto);
	if (!updated) throw new NotFoundError("DocumentProfile");

	logger.info({id, orgId}, "Document profile updated");

	return updated;
}

export async function removeDocumentProfile(
	id: string,
	orgId: string,
): Promise<void> {
	const existing = await findDocumentProfileById(id, orgId);
	if (!existing) throw new NotFoundError("DocumentProfile");

	const deleted = await deleteDocumentProfile(id, orgId);
	if (!deleted) throw new NotFoundError("DocumentProfile");

	logger.info({id, orgId}, "Document profile deleted");
}
