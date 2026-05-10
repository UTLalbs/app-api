import {Router} from "express";
import multer from "multer";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	createDocumentFromDraftHandler,
	deleteTrailerDocumentHandler,
	discardDocumentDraftHandler,
	extractTrailerDocumentHandler,
	getTrailerDocumentHandler,
	getTrailerDocumentUrlHandler,
	listTrailerDocumentsHandler,
	replaceTrailerDocumentHandler,
	updateTrailerDocumentHandler,
	uploadTrailerDocumentHandler,
} from "./documents/trailer-documents.controller";
import {
	createDocumentFromDraftSchema,
	discardDocumentDraftSchema,
	replaceTrailerDocumentSchema,
	trailerDocumentIdParamSchema,
	trailerIdParamSchema as trailerIdParamSchemaForDocs,
	updateTrailerDocumentSchema,
	uploadTrailerDocumentSchema,
} from "./documents/trailer-documents.validator";
import {
	checkDuplicateHandler,
	createTrailerHandler,
	decodeVinHandler,
	deleteTrailerHandler,
	getTrailerHandler,
	listTrailersHandler,
	quickRegisterTrailerHandler,
	removeTrailerPhotoHandler,
	setTrailerPhotoHandler,
	transitionStatusHandler,
	updateTrailerHandler,
} from "./trailers.controller";
import {
	checkDuplicateSchema,
	createTrailerSchema,
	decodeVinSchema,
	listTrailersSchema,
	quickRegisterTrailerSchema,
	trailerIdParamSchema,
	trailerPhotoParamSchema,
	transitionStatusSchema,
	updateTrailerSchema,
} from "./trailers.validator";

// Multer en memoria — archivos validados y subidos a S3 desde el service.
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {fileSize: 10 * 1024 * 1024}, // 10 MB
});

export const trailersRouter = Router();

trailersRouter.use(authenticate);

trailersRouter.get(
	"/",
	validate(listTrailersSchema),
	authorize("trailers", "read"),
	listTrailersHandler,
);

trailersRouter.get(
	"/:id",
	validate(trailerIdParamSchema),
	authorize("trailers", "read"),
	getTrailerHandler,
);

trailersRouter.post(
	"/",
	validate(createTrailerSchema),
	authorize("trailers", "create"),
	createTrailerHandler,
);

trailersRouter.post(
	"/quick-register",
	validate(quickRegisterTrailerSchema),
	authorize("trailers", "create"),
	quickRegisterTrailerHandler,
);

// Endpoint auxiliar — read-only, solo requiere permiso de lectura
trailersRouter.post(
	"/decode-vin",
	validate(decodeVinSchema),
	authorize("trailers", "read"),
	decodeVinHandler,
);

// Pre-check de duplicados (VIN/placas/económico) en el wizard de alta
trailersRouter.post(
	"/check-duplicate",
	validate(checkDuplicateSchema),
	authorize("trailers", "read"),
	checkDuplicateHandler,
);

trailersRouter.patch(
	"/:id",
	validate(updateTrailerSchema),
	authorize("trailers", "update"),
	updateTrailerHandler,
);

trailersRouter.delete(
	"/:id",
	validate(trailerIdParamSchema),
	authorize("trailers", "delete"),
	deleteTrailerHandler,
);

trailersRouter.post(
	"/:id/transition-status",
	validate(transitionStatusSchema),
	authorize("trailers", "update"),
	transitionStatusHandler,
);

// Fotos del remolque — 4 slots fijos: leftSide, rightSide, rear, couplingFront
trailersRouter.post(
	"/:id/photos/:position",
	upload.single("file"),
	validate(trailerPhotoParamSchema),
	authorize("trailers", "update"),
	setTrailerPhotoHandler,
);

trailersRouter.delete(
	"/:id/photos/:position",
	validate(trailerPhotoParamSchema),
	authorize("trailers", "update"),
	removeTrailerPhotoHandler,
);

// ── Documents ─────────────────────────────────────────────────────────────
// IMPORTANTE: el extract stateless va antes del path con :trailerId para que
// "documents/extract" no se interprete como trailerId="documents".

trailersRouter.post(
	"/documents/extract",
	upload.single("file"),
	authorize("trailers", "read"),
	extractTrailerDocumentHandler,
);

// Descarta un draft (archivo en trailers-pending/) sin asociarlo a un trailer
trailersRouter.post(
	"/documents/discard-draft",
	validate(discardDocumentDraftSchema),
	authorize("trailers", "create"),
	discardDocumentDraftHandler,
);

trailersRouter.get(
	"/:trailerId/documents",
	validate(trailerIdParamSchemaForDocs),
	authorize("trailers", "read"),
	listTrailerDocumentsHandler,
);

trailersRouter.post(
	"/:trailerId/documents",
	upload.single("file"),
	validate(uploadTrailerDocumentSchema),
	authorize("trailers", "update"),
	uploadTrailerDocumentHandler,
);

// Crear documento a partir de un draft previamente subido en /extract
trailersRouter.post(
	"/:trailerId/documents/from-draft",
	validate(createDocumentFromDraftSchema),
	authorize("trailers", "update"),
	createDocumentFromDraftHandler,
);

// GET single doc (id directo, no anidado en trailer)
trailersRouter.get(
	"/documents/:id",
	validate(trailerDocumentIdParamSchema),
	authorize("trailers", "read"),
	getTrailerDocumentHandler,
);

// Presigned URL para descargar el archivo
trailersRouter.get(
	"/documents/:id/url",
	validate(trailerDocumentIdParamSchema),
	authorize("trailers", "read"),
	getTrailerDocumentUrlHandler,
);

// Editar metadata
trailersRouter.patch(
	"/documents/:id",
	validate(updateTrailerDocumentSchema),
	authorize("trailers", "update"),
	updateTrailerDocumentHandler,
);

// Reemplazar archivo (renovación) — guarda la versión anterior
trailersRouter.post(
	"/documents/:id/replace",
	upload.single("file"),
	validate(replaceTrailerDocumentSchema),
	authorize("trailers", "update"),
	replaceTrailerDocumentHandler,
);

trailersRouter.delete(
	"/documents/:id",
	validate(trailerDocumentIdParamSchema),
	authorize("trailers", "delete"),
	deleteTrailerDocumentHandler,
);
