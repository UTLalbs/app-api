import {Router} from "express";
import multer from "multer";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	createDocumentFromDraftHandler,
	deleteUnitDocumentHandler,
	discardDocumentDraftHandler,
	extractUnitDocumentHandler,
	getUnitDocumentHandler,
	getUnitDocumentUrlHandler,
	listUnitDocumentsHandler,
	replaceUnitDocumentHandler,
	updateUnitDocumentHandler,
	uploadUnitDocumentHandler,
} from "./documents/unit-documents.controller";
import {
	createUnitDocumentFromDraftSchema,
	discardUnitDocumentDraftSchema,
	replaceUnitDocumentSchema,
	unitDocumentIdParamSchema,
	unitIdParamSchemaForDocs,
	updateUnitDocumentSchema,
	uploadUnitDocumentSchema,
} from "./documents/unit-documents.validator";
import {
	assignOperatorHandler,
	checkUnitDuplicateHandler,
	createUnitHandler,
	decodeUnitVinHandler,
	deleteUnitHandler,
	getUnitHandler,
	listUnitsHandler,
	quickRegisterUnitHandler,
	removeUnitPhotoHandler,
	setUnitPhotoHandler,
	transitionUnitStatusHandler,
	unassignOperatorHandler,
	updateUnitHandler,
} from "./units.controller";
import {
	assignOperatorSchema,
	checkUnitDuplicateSchema,
	createUnitSchema,
	decodeUnitVinSchema,
	listUnitsSchema,
	quickRegisterUnitSchema,
	transitionUnitStatusSchema,
	unitIdParamSchema,
	unitPhotoParamSchema,
	updateUnitSchema,
} from "./units.validator";

// Multer en memoria — archivos validados y subidos a S3 desde el service.
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {fileSize: 10 * 1024 * 1024}, // 10 MB
});

export const unitsRouter = Router();

unitsRouter.use(authenticate);

unitsRouter.get(
	"/",
	validate(listUnitsSchema),
	authorize("units", "read"),
	listUnitsHandler,
);

unitsRouter.post(
	"/",
	validate(createUnitSchema),
	authorize("units", "create"),
	createUnitHandler,
);

unitsRouter.post(
	"/quick-register",
	validate(quickRegisterUnitSchema),
	authorize("units", "create"),
	quickRegisterUnitHandler,
);

unitsRouter.post(
	"/decode-vin",
	validate(decodeUnitVinSchema),
	authorize("units", "read"),
	decodeUnitVinHandler,
);

// Pre-check de duplicados (VIN/placas/económico) en el wizard de alta
unitsRouter.post(
	"/check-duplicate",
	validate(checkUnitDuplicateSchema),
	authorize("units", "read"),
	checkUnitDuplicateHandler,
);

// ── Documents — IMPORTANTE: rutas estáticas de /documents/* van ANTES de
// /:id para que no choque el path matching (`/:id` capturaría "documents").

unitsRouter.post(
	"/documents/extract",
	upload.single("file"),
	authorize("units", "read"),
	extractUnitDocumentHandler,
);

unitsRouter.post(
	"/documents/discard-draft",
	validate(discardUnitDocumentDraftSchema),
	authorize("units", "create"),
	discardDocumentDraftHandler,
);

// GET single doc por id
unitsRouter.get(
	"/documents/:id",
	validate(unitDocumentIdParamSchema),
	authorize("units", "read"),
	getUnitDocumentHandler,
);

// Presigned URL para descargar el archivo
unitsRouter.get(
	"/documents/:id/url",
	validate(unitDocumentIdParamSchema),
	authorize("units", "read"),
	getUnitDocumentUrlHandler,
);

// Editar metadata del doc
unitsRouter.patch(
	"/documents/:id",
	validate(updateUnitDocumentSchema),
	authorize("units", "update"),
	updateUnitDocumentHandler,
);

// Reemplazar archivo (renovación) — guarda la versión anterior
unitsRouter.post(
	"/documents/:id/replace",
	upload.single("file"),
	validate(replaceUnitDocumentSchema),
	authorize("units", "update"),
	replaceUnitDocumentHandler,
);

unitsRouter.delete(
	"/documents/:id",
	validate(unitDocumentIdParamSchema),
	authorize("units", "delete"),
	deleteUnitDocumentHandler,
);

// ── Rutas con :unitId / :id (después de las estáticas /documents/*)

unitsRouter.get(
	"/:id",
	validate(unitIdParamSchema),
	authorize("units", "read"),
	getUnitHandler,
);

unitsRouter.patch(
	"/:id",
	validate(updateUnitSchema),
	authorize("units", "update"),
	updateUnitHandler,
);

unitsRouter.delete(
	"/:id",
	validate(unitIdParamSchema),
	authorize("units", "delete"),
	deleteUnitHandler,
);

unitsRouter.post(
	"/:id/transition-status",
	validate(transitionUnitStatusSchema),
	authorize("units", "update"),
	transitionUnitStatusHandler,
);

unitsRouter.post(
	"/:id/assign-operator",
	validate(assignOperatorSchema),
	authorize("units", "update"),
	assignOperatorHandler,
);

unitsRouter.post(
	"/:id/unassign-operator",
	validate(unitIdParamSchema),
	authorize("units", "update"),
	unassignOperatorHandler,
);

// Fotos de la unidad — 4 slots fijos: leftSide, rightSide, front, rear
unitsRouter.post(
	"/:id/photos/:position",
	upload.single("file"),
	validate(unitPhotoParamSchema),
	authorize("units", "update"),
	setUnitPhotoHandler,
);

unitsRouter.delete(
	"/:id/photos/:position",
	validate(unitPhotoParamSchema),
	authorize("units", "update"),
	removeUnitPhotoHandler,
);

// Documents por unidad
unitsRouter.get(
	"/:unitId/documents",
	validate(unitIdParamSchemaForDocs),
	authorize("units", "read"),
	listUnitDocumentsHandler,
);

unitsRouter.post(
	"/:unitId/documents",
	upload.single("file"),
	validate(uploadUnitDocumentSchema),
	authorize("units", "update"),
	uploadUnitDocumentHandler,
);

// Crear doc a partir de un draft previamente subido en /extract
unitsRouter.post(
	"/:unitId/documents/from-draft",
	validate(createUnitDocumentFromDraftSchema),
	authorize("units", "update"),
	createDocumentFromDraftHandler,
);

