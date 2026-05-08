import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {getPostalCode, validateRfcHandler} from "./sat.controller";
import {postalCodeParamSchema, validateRfcSchema} from "./sat.validator";

export const satRouter = Router();

// Todas las rutas requieren autenticación
satRouter.use(authenticate);

// GET /api/v1/sat/postal-code/:cp
satRouter.get(
	"/postal-code/:cp",
	validate(postalCodeParamSchema),
	authorize("tax_entities", "read"),
	getPostalCode,
);

// POST /api/v1/sat/validate-rfc
satRouter.post(
	"/validate-rfc",
	validate(validateRfcSchema),
	authorize("tax_entities", "read"),
	validateRfcHandler,
);
