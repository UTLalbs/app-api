import {BSONError} from "bson";
import type {NextFunction, Request, Response} from "express";
import {MongoError, MongoInvalidArgumentError, MongoServerError} from "mongodb";

import {env} from "../config/env";
import {logger} from "../config/logger";
import {AppError} from "../shared/errors/AppError";

interface ErrorResponse {
	success: false;
	error: {
		code: string;
		message: string;
		details?: {field: string; message: string}[];
		requestId: string;
		stack?: string;
	};
}

export function errorHandler(
	err: Error,
	req: Request,
	res: Response,
	_next: NextFunction,
): void {
	const requestId = req.requestId;

	// ── Error operacional conocido (AppError y subclases) ──────────────────────
	if (err instanceof AppError && err.isOperational) {
		logger.warn(
			{err, requestId, path: req.path, method: req.method},
			`Operational error: ${err.code}`,
		);

		res.status(err.statusCode).json({
			success: false,
			error: {
				code: err.code,
				message: err.message,
				details: Array.isArray(err.details)
					? (err.details as {field: string; message: string}[])
					: undefined,
				requestId,
			},
		} satisfies ErrorResponse);
		return;
	}

	// ── BSONError — ID inválido ────────────────────────────────────────────────
	if (err instanceof BSONError) {
		res.status(400).json({
			success: false,
			error: {
				code: "INVALID_ID",
				message: "Invalid ID format — must be a 24 character hex string",
				requestId,
			},
		} satisfies ErrorResponse);
		return;
	}

	// ── Duplicate key de MongoDB (código 11000) ────────────────────────────────
	if (err instanceof MongoServerError && err.code === 11000) {
		logger.warn({err, requestId}, "MongoDB duplicate key error");

		res.status(409).json({
			success: false,
			error: {
				code: "CONFLICT",
				message: "Resource already exists",
				requestId,
			},
		} satisfies ErrorResponse);
		return;
	}

	// ── MongoDB: argumento inválido al driver (bug de programación) ───────────
	// Esto pasa cuando le mandamos al driver un valor del tipo equivocado
	// (ej. .limit("100") en vez de .limit(100)). NO es un problema de DB
	// transient — es un bug nuestro. Devolver 500 para que se note y se arregle.
	if (err instanceof MongoInvalidArgumentError) {
		logger.error(
			{err, requestId, path: req.path, method: req.method},
			"MongoDB driver called with invalid argument (programmer bug)",
		);

		res.status(500).json({
			success: false,
			error: {
				code: "INTERNAL_ERROR",
				message: "Invalid database operation",
				requestId,
				...(env.NODE_ENV === "development" && {stack: err.stack}),
			},
		} satisfies ErrorResponse);
		return;
	}

	// ── Error genérico de MongoDB (conexión, timeout, etc.) ───────────────────
	if (err instanceof MongoError) {
		logger.error({err, requestId}, "MongoDB error");

		res.status(503).json({
			success: false,
			error: {
				code: "SERVICE_UNAVAILABLE",
				message: "Database temporarily unavailable",
				requestId,
			},
		} satisfies ErrorResponse);
		return;
	}

	// ── Error no controlado — nunca exponer detalles en producción ────────────
	logger.error(
		{err, requestId, path: req.path, method: req.method},
		"Unhandled error",
	);

	res.status(500).json({
		success: false,
		error: {
			code: "INTERNAL_ERROR",
			message: "Internal server error",
			requestId,
			...(env.NODE_ENV === "development" && {stack: err.stack}),
		},
	} satisfies ErrorResponse);
}
