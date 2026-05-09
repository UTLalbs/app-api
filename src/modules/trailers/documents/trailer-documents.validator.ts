import {z} from "zod";

import {TRAILER_DOCUMENT_TYPES} from "../constants/trailerDocumentTypes.constants";

const trailerDocumentTypeSchema = z.enum(
	TRAILER_DOCUMENT_TYPES as [string, ...string[]],
);

const trailerDocumentStatusSchema = z.enum([
	"pending",
	"verified",
	"expired",
	"rejected",
]);

const idSchema = z.string().length(24);

const optionalDate = z.union([z.string(), z.date()]).nullable().optional();

// Multipart: el body trae los campos como strings (el archivo va en req.file).
// Validamos los strings y dejamos que el service convierta tipos.
export const uploadTrailerDocumentSchema = z.object({
	params: z.object({trailerId: idSchema}),
	body: z.object({
		type: trailerDocumentTypeSchema,
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

export const updateTrailerDocumentSchema = z.object({
	params: z.object({id: idSchema}),
	body: z.object({
		type: trailerDocumentTypeSchema.optional(),
		name: z.string().max(255).nullable().optional(),
		issuedAt: optionalDate,
		expiresAt: optionalDate,
		alertDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
		notes: z.string().max(1000).nullable().optional(),
		status: trailerDocumentStatusSchema.optional(),
	}),
});

export const trailerDocumentIdParamSchema = z.object({
	params: z.object({id: idSchema}),
});

export const trailerIdParamSchema = z.object({
	params: z.object({trailerId: idSchema}),
});

// Stateless: solo acepta el archivo (multipart). No tiene body validable.
export const extractTrailerDocumentSchema = z.object({
	body: z.object({}).passthrough(),
});

export const replaceTrailerDocumentSchema = z.object({
	params: z.object({id: idSchema}),
	body: z.object({}).passthrough(),
});

// Crear documento a partir de un draft (archivo ya en S3 trailers-pending/)
export const createDocumentFromDraftSchema = z.object({
	params: z.object({trailerId: idSchema}),
	body: z.object({
		draftKey: z.string().min(1).max(500),
		fileName: z.string().min(1).max(255),
		fileSize: z.coerce.number().int().min(0).max(10 * 1024 * 1024),
		mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg", "image/png"]),
		type: trailerDocumentTypeSchema,
		name: z.string().max(255).nullable().optional(),
		issuedAt: optionalDate,
		expiresAt: optionalDate,
		alertDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
		notes: z.string().max(1000).nullable().optional(),
		extractedData: z.record(z.string(), z.unknown()).nullable().optional(),
		extractionConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
	}),
});

export const discardDocumentDraftSchema = z.object({
	body: z.object({
		draftKey: z.string().min(1).max(500),
	}),
});
