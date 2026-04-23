import * as path from "path";

import * as dotenv from "dotenv";
import {z} from "zod";

// ── Cargar archivo .env según NODE_ENV ─────────────────────────────────────
// .env                →  development (default)
// .env.staging        →  staging
// .env.production     →  production

const nodeEnv = process.env.NODE_ENV ?? "development";

const envFile =
	nodeEnv === "production"
		? ".env.production"
		: nodeEnv === "staging"
			? ".env.staging"
			: ".env";

dotenv.config({path: path.resolve(process.cwd(), envFile)});

// ── Schema de validación ───────────────────────────────────────────────────

const envSchema = z.object({
	// App
	NODE_ENV: z
		.enum(["development", "staging", "production"])
		.default("development"),
	PORT: z.coerce.number().default(3000),
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "debug", "trace"])
		.default("info"),

	// Database
	MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

	// Redis
	REDIS_URL: z.string().min(1, "REDIS_URL is required"),

	// JWT
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
	JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

	// Google OAuth
	GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
	GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
	GOOGLE_REDIRECT_URI: z
		.string()
		.url("GOOGLE_REDIRECT_URI must be a valid URL"),

	// Microsoft / Azure AD
	MICROSOFT_CLIENT_ID: z.string().min(1, "MICROSOFT_CLIENT_ID is required"),
	MICROSOFT_CLIENT_SECRET: z
		.string()
		.min(1, "MICROSOFT_CLIENT_SECRET is required"),
	MICROSOFT_TENANT_ID: z.string().default("common"),
	MICROSOFT_REDIRECT_URI: z
		.string()
		.url("MICROSOFT_REDIRECT_URI must be a valid URL"),

	// CORS
	ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
	FRONTEND_URL: z.string().url().default("http://localhost:3001"),

	// Rate limiting
	RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
	RATE_LIMIT_MAX_AUTH: z.coerce.number().default(10),
	RATE_LIMIT_MAX_API: z.coerce.number().default(100),

	// FacturoPorTi / Tax service
	FACTUROPORTI_BASE_URL: z.string().url(),
	FACTUROPORTI_TOKEN: z.string().min(1),

	// Developer notification (placeholders hasta Phase 2)
	DEVELOPER_EMAIL: z.string().email().optional(),

	// AWS S3
	S3_BUCKET_NAME: z.string().min(1),
	S3_REGION: z.string().min(1),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),

	// Audit archive (cold storage) — opcional; sin bucket el job se omite.
	AUDIT_ARCHIVE_BUCKET: z.string().min(1).optional(),

	// Encryption
	ENCRYPTION_KEY: z
		.string()
		.length(32, "ENCRYPTION_KEY must be exactly 32 characters"),
});

// ── Validar ────────────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	// eslint-disable-next-line no-console
	console.error("❌  Invalid environment variables:\n");
	parsed.error.issues.forEach((issue) => {
		// eslint-disable-next-line no-console
		console.error(`  ${issue.path.join(".")}: ${issue.message}`);
	});
	// eslint-disable-next-line no-console
	console.error("\nFix the above variables and restart the server.\n");
	process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
