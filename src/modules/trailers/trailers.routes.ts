import {Router} from "express";

import {authenticate} from "../../middleware/authenticate";
import {authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate";

import {
	createTrailerHandler,
	decodeVinHandler,
	deleteTrailerHandler,
	getTrailerHandler,
	listTrailersHandler,
	quickRegisterTrailerHandler,
	transitionStatusHandler,
	updateTrailerHandler,
} from "./trailers.controller";
import {
	createTrailerSchema,
	decodeVinSchema,
	listTrailersSchema,
	quickRegisterTrailerSchema,
	trailerIdParamSchema,
	transitionStatusSchema,
	updateTrailerSchema,
} from "./trailers.validator";

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
