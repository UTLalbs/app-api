import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	createOrganization,
	deleteOrganization,
	getOrganization,
	getOrganizations,
	updateOrganization,
} from "./organization.controller";
import {
	createOrganizationSchema,
	orgIdParamSchema,
	updateOrganizationSchema,
} from "./organization.validator";
import {
	addTaxIdHandler,
	disableTaxIdHandler,
	getTaxIdHandler,
	listTaxIdsHandler,
	setDefaultTaxIdHandler,
	updateTaxIdHandler,
	validateTaxIdRfcHandler,
} from "./taxId.controller";
import {
	createTaxIdSchema,
	orgIdAndTaxIdParamSchema,
	orgIdParamSchema as orgIdParamSchemaTaxId,
	updateTaxIdSchema,
} from "./taxId.validator";

export const organizationRouter = Router();

// Todas las rutas de organizations requieren autenticación
organizationRouter.use(authenticate);

organizationRouter.get("/", authorize("users", "read"), getOrganizations);
// GET /:id no usa authorize: cualquier usuario autenticado puede leer su propia
// org (necesario para que AppLayout descubra qué features están habilitadas).
// El controller verifica que sea su propia org o que sea super_admin.
organizationRouter.get("/:id", validate(orgIdParamSchema), getOrganization);
organizationRouter.post(
	"/",
	validate(createOrganizationSchema),
	authorize("users", "create"),
	createOrganization,
);
organizationRouter.patch(
	"/:id",
	validate(updateOrganizationSchema),
	authorize("users", "update"),
	updateOrganization,
);
organizationRouter.delete(
	"/:id",
	validate(orgIdParamSchema),
	authorize("users", "delete"),
	deleteOrganization,
);

// ── Tax IDs anidados (multi-RFC por organización) ─────────────────────────

organizationRouter.get(
	"/:id/tax-ids",
	validate(orgIdParamSchemaTaxId),
	authorize("users", "read"),
	listTaxIdsHandler,
);
organizationRouter.get(
	"/:id/tax-ids/:taxIdId",
	validate(orgIdAndTaxIdParamSchema),
	authorize("users", "read"),
	getTaxIdHandler,
);
organizationRouter.post(
	"/:id/tax-ids",
	validate(createTaxIdSchema),
	authorize("users", "update"),
	addTaxIdHandler,
);
organizationRouter.patch(
	"/:id/tax-ids/:taxIdId",
	validate(updateTaxIdSchema),
	authorize("users", "update"),
	updateTaxIdHandler,
);
organizationRouter.delete(
	"/:id/tax-ids/:taxIdId",
	validate(orgIdAndTaxIdParamSchema),
	authorize("users", "update"),
	disableTaxIdHandler,
);
organizationRouter.post(
	"/:id/tax-ids/:taxIdId/set-default",
	validate(orgIdAndTaxIdParamSchema),
	authorize("users", "update"),
	setDefaultTaxIdHandler,
);
organizationRouter.post(
	"/:id/tax-ids/:taxIdId/validate-rfc",
	validate(orgIdAndTaxIdParamSchema),
	authorize("users", "update"),
	validateTaxIdRfcHandler,
);
