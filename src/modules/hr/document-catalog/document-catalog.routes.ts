import {Router} from "express";

import {authenticate} from "../../../middleware/authenticate";
import {authorize} from "../../../middleware/authorize";
import {validate} from "../../../middleware/validate";

import {
	getDocumentCatalog,
	createDocumentCatalog,
	updateDocumentCatalog,
	deleteDocumentCatalog,
	getDocumentCatalogUsageHandler,
} from "./document-catalog.controller";
import {
	listDocumentCatalogSchema,
	createDocumentCatalogSchema,
	updateDocumentCatalogSchema,
	catalogIdParamSchema,
	deleteDocumentCatalogSchema
} from "./document-catalog.validator";

export const documentCatalogRouter = Router();

documentCatalogRouter.use( authenticate );

// GET /api/v1/hr/document-catalog/:id/usage
documentCatalogRouter.get(
  '/:id/usage',
  validate(catalogIdParamSchema),
  authorize('employees', 'read'),
  getDocumentCatalogUsageHandler,
);


// GET /api/v1/hr/document-catalog
documentCatalogRouter.get(
	"/",
	validate(listDocumentCatalogSchema),
	authorize("employees", "read"),
	getDocumentCatalog,
);

// POST /api/v1/hr/document-catalog
documentCatalogRouter.post(
	"/",
	validate(createDocumentCatalogSchema),
	authorize("employees", "create"),
	createDocumentCatalog,
);

// PATCH /api/v1/hr/document-catalog/:id
documentCatalogRouter.patch(
	"/:id",
	validate(updateDocumentCatalogSchema),
	authorize("employees", "update"),
	updateDocumentCatalog,
);

// DELETE /api/v1/hr/document-catalog/:id
documentCatalogRouter.delete(
  '/:id',
  validate(deleteDocumentCatalogSchema),
  authorize('employees', 'delete'),
  deleteDocumentCatalog,
);
