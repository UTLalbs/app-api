import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	autocompleteHandler,
	checkPointHandler,
	createLocationHandler,
	deleteLocationHandler,
	getByIdOrigenDestinoHandler,
	getLocationById,
	getLocationUsageHandler,
	getLocations,
	getNearbyHandler,
	popularTagsHandler,
	tagsAutocompleteHandler,
	updateLocationHandler,
	validateFiscalHandler,
} from "./location.controller";
import {
	autocompleteLocationsSchema,
	checkPointSchema,
	createLocationSchema,
	idOrigenDestinoParamSchema,
	listLocationsSchema,
	locationIdParamSchema,
	nearbyLocationsSchema,
	tagsAutocompleteSchema,
	updateLocationSchema,
	validateFiscalSchema,
} from "./location.validator";

export const locationRouter = Router();

locationRouter.use(authenticate);

// ── Tags (registrar antes de /:id para evitar colisión) ──────────────────
locationRouter.get(
	"/tags/popular",
	authorize("locations", "read"),
	popularTagsHandler,
);
locationRouter.get(
	"/tags/autocomplete",
	validate(tagsAutocompleteSchema),
	authorize("locations", "read"),
	tagsAutocompleteHandler,
);

// ── Búsqueda especializada ───────────────────────────────────────────────
locationRouter.get(
	"/nearby",
	validate(nearbyLocationsSchema),
	authorize("locations", "read"),
	getNearbyHandler,
);
locationRouter.get(
	"/autocomplete",
	validate(autocompleteLocationsSchema),
	authorize("locations", "read"),
	autocompleteHandler,
);
locationRouter.get(
	"/by-id-origen-destino/:id",
	validate(idOrigenDestinoParamSchema),
	authorize("locations", "read"),
	getByIdOrigenDestinoHandler,
);

// ── CRUD ─────────────────────────────────────────────────────────────────
locationRouter.get(
	"/",
	validate(listLocationsSchema),
	authorize("locations", "read"),
	getLocations,
);
locationRouter.post(
	"/",
	validate(createLocationSchema),
	authorize("locations", "create"),
	createLocationHandler,
);
locationRouter.get(
	"/:id",
	validate(locationIdParamSchema),
	authorize("locations", "read"),
	getLocationById,
);
locationRouter.patch(
	"/:id",
	validate(updateLocationSchema),
	authorize("locations", "update"),
	updateLocationHandler,
);
locationRouter.delete(
	"/:id",
	validate(locationIdParamSchema),
	authorize("locations", "delete"),
	deleteLocationHandler,
);

// ── Usage / fiscal validation / geofence check ───────────────────────────
locationRouter.get(
	"/:id/usage",
	validate(locationIdParamSchema),
	authorize("locations", "read"),
	getLocationUsageHandler,
);
locationRouter.post(
	"/:id/validate-fiscal",
	validate(validateFiscalSchema),
	authorize("locations", "update"),
	validateFiscalHandler,
);
locationRouter.post(
	"/:id/check-point",
	validate(checkPointSchema),
	authorize("locations", "read"),
	checkPointHandler,
);
