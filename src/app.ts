import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";

import {getMongoClient} from "./config/database";
import {env} from "./config/env";
import {logger} from "./config/logger";
import {getRedisClient} from "./config/redis";
import {openApiDocument} from "./docs/openapi";
import {errorHandler} from "./middleware/errorHandler";
import {apiLimiter} from "./middleware/rateLimiter";
import {requestId} from "./middleware/requestId";
import {authRouter} from "./modules/auth/auth.routes";
import {organizationRouter} from "./modules/organizations/organization.routes";
import {roleRouter} from "./modules/roles/role.routes";
import {taxRouter} from "./modules/tax/tax.routes";
import { userRouter } from "./modules/users/user.routes";

export function createApp(): express.Application {
	const app = express();

	// Deshabilitar ETag — API puro, sin assets estáticos
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

	app.use(
		pinoHttp({
			logger,
			autoLogging: {
				ignore: (req) => req.url === "/health" || req.url === "/health/ready",
			},
			customLogLevel: (_req, res) => {
				if (res.statusCode >= 500) return "error";
				if (res.statusCode >= 400) return "warn";
				return "info";
			},
		}),
	);

	// ── Health checks ──────────────────────────────────────────────────────────

	// Liveness — ¿está el proceso vivo?
	app.get("/health", (_req, res) => {
		res.json({status: "ok", timestamp: new Date().toISOString()});
	});

	// Readiness — ¿puede recibir tráfico? (verifica MongoDB + Redis)
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

	// ── API routes ────────────────────────────────────────────────────────────
	app.use("/api/v1/auth", authRouter);
	app.use("/api/v1/organizations", organizationRouter);
	app.use("/api/v1/roles", apiLimiter, roleRouter);
	app.use("/api/v1/users", userRouter);
	app.use( "/api/v1/tax", apiLimiter, taxRouter );

	// ── Swagger UI ────────────────────────────────────────────────────────────
	// Solo disponible en development y staging, nunca en production
	if (env.NODE_ENV !== "production") {
		app.use(
			"/api/docs",
			swaggerUi.serve,
			swaggerUi.setup(openApiDocument, {
				customSiteTitle: "UTL API Docs",
				swaggerOptions: {
					persistAuthorization: true,
				},
			}),
		);
	}

	// ── 404 handler ───────────────────────────────────────────────────────────
	app.use((_req, res) => {
		res.status(404).json({
			success: false,
			error: {
				code: "NOT_FOUND",
				message: "Route not found",
			},
		});
	});

	// ── Error handler (SIEMPRE el último middleware) ───────────────────────────
	app.use(errorHandler);

	return app;
}
