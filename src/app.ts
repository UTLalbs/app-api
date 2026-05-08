import cookieParser from "cookie-parser";
import cors from "cors";
import express, {type RequestHandler} from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import {getMongoClient} from "./config/database";
import {env} from "./config/env";
import {getRedisClient} from "./config/redis";
import {openApiDocument} from "./docs/openapi";
import {errorHandler} from "./middleware/errorHandler";
import {apiLimiter} from "./middleware/rateLimiter";
import {requestId} from "./middleware/requestId";
import {auditRouter} from "./modules/audit/audit.routes";
import {authRouter} from "./modules/auth/auth.routes";
import {businessPartnersRouter} from "./modules/business-partners/business-partners.routes";
import {catalogsRouter} from "./modules/catalogs/catalogs.routes";
import {absenceRouter} from "./modules/hr/absences/absence.routes";
import {departmentRouter} from "./modules/hr/departments/department.routes";
import {documentCatalogRouter} from "./modules/hr/document-catalog/document-catalog.routes";
import {documentProfileRouter} from "./modules/hr/document-profiles/document-profile.routes";
import {employeeRouter} from "./modules/hr/employees/employee.routes";
import {positionRouter} from "./modules/hr/positions/position.routes";
import {scheduleRouter} from "./modules/hr/schedules/schedule.routes";
import {timeClockRouter} from "./modules/hr/time-clocks/time-clock.routes";
import {locationRouter} from "./modules/locations/location.routes";
import {notificationRouter} from "./modules/notifications/notification.routes";
import {organizationRouter} from "./modules/organizations/organization.routes";
import {roleRouter} from "./modules/roles/role.routes";
import {satRouter} from "./modules/sat/sat.routes";
import {taskRouter} from "./modules/tasks/task.routes";
import {trailersRouter} from "./modules/trailers/trailers.routes";
import {userRouter} from "./modules/users/user.routes";

export function createApp(httpLogger: RequestHandler): express.Application {
	const app = express();

	app.set("etag", false);

	// ── Seguridad ──────────────────────────────────────────────────────────────
	app.use(helmet());

	app.use(
		cors({
			origin: env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
			credentials: true,
			methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	);

	// ── Parsers ────────────────────────────────────────────────────────────────
	app.use(express.json({limit: "1mb"}));
	app.use(express.urlencoded({extended: true, limit: "1mb"}));
	app.use(cookieParser());

	// ── Observabilidad ─────────────────────────────────────────────────────────
	app.use(requestId);
	app.use(httpLogger); // ← recibido desde server.ts

	// ── Health checks ──────────────────────────────────────────────────────────
	app.get("/health", (_req, res) => {
		res.json({status: "ok", timestamp: new Date().toISOString()});
	});

	app.get("/health/ready", async (_req, res) => {
		const checks = await Promise.allSettled([
			getMongoClient().db("admin").command({ping: 1}),
			getRedisClient().ping(),
		]);

		const dbOk = checks[0].status === "fulfilled";
		const redisOk = checks[1].status === "fulfilled";
		const ready = dbOk && redisOk;

		res.status(ready ? 200 : 503).json({
			status: ready ? "ready" : "not ready",
			checks: {
				database: dbOk ? "ok" : "error",
				redis: redisOk ? "ok" : "error",
			},
			timestamp: new Date().toISOString(),
		});
	});

	// ── API routes ─────────────────────────────────────────────────────────────
	app.use("/api/v1/auth", authRouter);
	app.use("/api/v1/organizations", organizationRouter);
	app.use("/api/v1/roles", apiLimiter, roleRouter);
	app.use("/api/v1/users", userRouter);
	app.use("/api/v1/sat", apiLimiter, satRouter);
	app.use("/api/v1/catalogs", apiLimiter, catalogsRouter);
	app.use("/api/v1/business-partners", apiLimiter, businessPartnersRouter);
	app.use("/api/v1/trailers", apiLimiter, trailersRouter);
	app.use("/api/v1/tasks", apiLimiter, taskRouter);
	app.use("/api/v1/notifications", apiLimiter, notificationRouter);
	app.use("/api/v1/employees", apiLimiter, employeeRouter);
	app.use("/api/v1/hr/document-catalog", apiLimiter, documentCatalogRouter);
	app.use("/api/v1/hr/document-profiles", apiLimiter, documentProfileRouter);
	app.use("/api/v1/hr/positions", apiLimiter, positionRouter);
	app.use("/api/v1/hr/departments", apiLimiter, departmentRouter);
	app.use("/api/v1/hr/schedules", apiLimiter, scheduleRouter);
	app.use("/api/v1/hr/absences", apiLimiter, absenceRouter);
	app.use("/api/v1/hr/time-clocks", apiLimiter, timeClockRouter);
	app.use("/api/v1/locations", apiLimiter, locationRouter);
	app.use("/api/v1/audit", apiLimiter, auditRouter);

	// ── Swagger UI ─────────────────────────────────────────────────────────────
	if (env.NODE_ENV !== "production") {
		app.use(
			"/api/docs",
			swaggerUi.serve,
			swaggerUi.setup(openApiDocument, {
				customSiteTitle: "UTL API Docs",
				swaggerOptions: {persistAuthorization: true},
			}),
		);
	}

	// ── 404 ────────────────────────────────────────────────────────────────────
	app.use((_req, res) => {
		res.status(404).json({
			success: false,
			error: {code: "NOT_FOUND", message: "Route not found"},
		});
	});

	// ── Error handler (siempre el último) ──────────────────────────────────────
	app.use(errorHandler);

	return app;
}
