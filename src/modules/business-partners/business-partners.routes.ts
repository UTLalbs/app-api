import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	createBusinessPartnerHandler,
	deleteBusinessPartnerHandler,
	getBusinessPartnerHandler,
	listBusinessPartnersHandler,
	updateBusinessPartnerHandler,
	validateBusinessPartnerRfcHandler,
} from "./business-partners.controller";
import {
	businessPartnerIdParamSchema,
	createBusinessPartnerSchema,
	listBusinessPartnersSchema,
	updateBusinessPartnerLooseSchema,
} from "./business-partners.validator";

export const businessPartnersRouter = Router();

businessPartnersRouter.use(authenticate);

// businessPartners NO es un Resource RBAC propio. Reusamos el permiso
// 'trailers' porque conceptualmente los partners viven dentro del manejo de
// remolques (intercambio, arrendamiento). Quien gestiona trailers, gestiona
// partners.

businessPartnersRouter.get(
	"/",
	validate(listBusinessPartnersSchema),
	authorize("trailers", "read"),
	listBusinessPartnersHandler,
);

businessPartnersRouter.get(
	"/:id",
	validate(businessPartnerIdParamSchema),
	authorize("trailers", "read"),
	getBusinessPartnerHandler,
);

businessPartnersRouter.post(
	"/",
	validate(createBusinessPartnerSchema),
	authorize("trailers", "create"),
	createBusinessPartnerHandler,
);

businessPartnersRouter.patch(
	"/:id",
	validate(updateBusinessPartnerLooseSchema),
	authorize("trailers", "update"),
	updateBusinessPartnerHandler,
);

businessPartnersRouter.delete(
	"/:id",
	validate(businessPartnerIdParamSchema),
	authorize("trailers", "delete"),
	deleteBusinessPartnerHandler,
);

businessPartnersRouter.post(
	"/:id/validate-rfc",
	validate(businessPartnerIdParamSchema),
	authorize("trailers", "read"),
	validateBusinessPartnerRfcHandler,
);
