import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {validate} from "../../middleware/validate";

import {getSatCatalogHandler} from "./catalogs.controller";
import {getSatCatalogSchema} from "./catalogs.validator";

export const catalogsRouter = Router();

// Toda la ruta requiere autenticación. NO requiere permiso especial: cualquier
// usuario autenticado puede leer catálogos SAT (son datos públicos del SAT, no
// PII de la org). Esto permite que selects y dropdowns funcionen sin permisos
// específicos.
catalogsRouter.use(authenticate);

// GET /api/v1/catalogs/sat/:catalogKey
catalogsRouter.get(
	"/sat/:catalogKey",
	validate(getSatCatalogSchema),
	getSatCatalogHandler,
);
