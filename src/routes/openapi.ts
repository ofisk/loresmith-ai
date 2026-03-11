import { swaggerUI } from "@hono/swagger-ui";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";

const APP_CONTEXT = {
	Bindings: {} as Env,
	Variables: { logger: {} as RequestLogger },
};

export function registerOpenAPIRoutes(
	app: OpenAPIHono<typeof APP_CONTEXT>
): void {
	app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"JWT from POST /auth/login. Pass as Authorization: Bearer <token>",
	});

	app.doc("/api/doc", {
		openapi: "3.1.0",
		info: {
			title: "LoreSmith API",
			version: "1.0.0",
			description:
				"API for LoreSmith - AI-powered campaign management and lore tools. Authenticate via POST /auth/login to receive a JWT, then pass it in the Authorization header as Bearer <token>.",
		},
		servers: [
			{ url: "http://localhost:8787", description: "Local development" },
			{
				url: "https://loresmith.ai",
				description: "Production",
			},
		],
	});

	app.get("/api/docs", swaggerUI({ url: "/api/doc" }));
}
