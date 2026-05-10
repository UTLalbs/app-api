import {z} from "zod";

import {UNIT_DOCUMENT_TYPES} from "../constants/unitDocumentTypes.constants";

const unitDocumentTypeSchema = z.enum(
	UNIT_DOCUMENT_TYPES as [string, ...string[]],
);

const unitDocumentStatusSchema = z.enum([
	"pending",
	"verified",
	"expired",
	"rejected",
]);

const idSchema = z.string().length(24);

const optionalDate = z.union([z.string(), z.date()]).nullable().optional();

// Multipart: el body trae los campos como strings (el archivo va en req.file).
export const uploadUnitDocumentSchema = z.object({
	params: z.object({unitId: idSchema}),
	body: z.object({
		type: unitDocumentTypeSchema,
		name: z.string().max(255).nullable().optional(),
		issuedAt: optionalDate,
		expiresAt: optionalDate,
		alertDays: z.coerce
			.number()
			.int()
			.min(0)
			.max(365)
			.nullable()
			.optional(),
		notes: z.string().max(1000).nullable().optional(),
		extractedData: z.record(z.string(), z.unknown()).nullable().optional(),
		extractionConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
	}),
});

export const updateUnitDocumentSchema = z.object({
	params: z.object({id: idSchema}),
	body: z.object({
		type: unitDocumentTypeSchema.optional(),
		name: z.string().max(255).nullable().optional(),
		issuedAt: optionalDate,
		expiresAt: optionalDate,
		alertDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
		notes: z.string().max(1000).nullable().optional(),
		status: unitDocumentStatusSchema.optional(),
	}),
});

export const unitDocumentIdParamSchema = z.object({
	params: z.object({id: idSchema}),
});

export const unitIdParamSchemaForDocs = z.object({
	params: z.object({unitId: idSchema}),
});

export const extractUnitDocumentSchema = z.object({
	body: z.object({}).passthrough(),
});

export const replaceUnitDocumentSchema = z.object({
	params: z.object({id: idSchema}),
	body: z.object({}).passthrough(),
});

export const createUnitDocumentFromDraftSchema = z.object({
	params: z.object({unitId: idSchema}),
	body: z.object({
		draftKey: z.string().min(1).max(500),
		fileName: z.string().min(1).max(255),
		fileSize: z.coerce.number().int().min(0).max(10 * 1024 * 1024),
		mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg", "image/png"]),
		type: unitDocumentTypeSchema,
		name: z.string().max(255).nullable().optional(),
		issuedAt: optionalDate,
		expiresAt: optionalDate,
		alertDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
		notes: z.string().max(1000).nullable().optional(),
		extractedData: z.record(z.string(), z.unknown()).nullable().optional(),
		extractionConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
	}),
});

export const discardUnitDocumentDraftSchema = z.object({
	body: z.object({
		draftKey: z.string().min(1).max(500),
	}),
});
