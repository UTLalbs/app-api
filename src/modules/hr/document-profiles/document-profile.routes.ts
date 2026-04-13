import {Router} from "express";

import {authenticate} from "../../../middleware/authenticate";
import {authorize} from "../../../middleware/authorize";
import {validate} from "../../../middleware/validate";

import {
	getDocumentProfiles,
	createDocumentProfile,
	updateDocumentProfile,
	deleteDocumentProfile,
} from "./document-profile.controller";
import {
	createDocumentProfileSchema,
	updateDocumentProfileSchema,
	profileIdParamSchema,
} from "./document-profile.validator";

export const documentProfileRouter = Router();

documentProfileRouter.use(authenticate);

documentProfileRouter.get(
	"/",
	authorize("employees", "read"),
	getDocumentProfiles,
);

documentProfileRouter.post(
	"/",
	validate(createDocumentProfileSchema),
	authorize("employees", "create"),
	createDocumentProfile,
);

documentProfileRouter.patch(
	"/:id",
	validate(updateDocumentProfileSchema),
	authorize("employees", "update"),
	updateDocumentProfile,
);

documentProfileRouter.delete(
	"/:id",
	validate(profileIdParamSchema),
	authorize("employees", "delete"),
	deleteDocumentProfile,
);
