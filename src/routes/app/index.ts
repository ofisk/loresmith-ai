import { routeAgentRequest } from "agents";
import type { Context, Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { AuthService } from "@/services/core/auth-service";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";

export function registerAppRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	const serveIndexHtml = async (c: Context<{ Bindings: Env }>) => {
		try {
			// Fetch / to get index.html (assets don't have /billing path; SPA routes need fallback)
			const url = new URL(c.req.url);
			const indexUrl = new URL("/", url.origin);
			const indexReq = new Request(indexUrl.toString(), {
				method: c.req.method,
				headers: c.req.raw.headers,
			});
			const assetResponse = await c.env.ASSETS.fetch(indexReq);
			if (assetResponse.status === 200) {
				return assetResponse;
			}
		} catch (_error) {
			console.log("Index.html not found in assets");
		}
		return new Response("Index.html not found", { status: 404 });
	};

	app.get("/", serveIndexHtml);
	app.get("/join", serveIndexHtml);
	app.get("/billing", serveIndexHtml);

	app.get("/assets/*", async (c) => {
		try {
			const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
			if (assetResponse.status === 200) {
				return assetResponse;
			}
		} catch (_error) {
			console.log("Asset not found:", c.req.path);
		}
		return new Response("Asset not found", { status: 404 });
	});

	app.get("/favicon.ico", async (c) => {
		try {
			const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
			if (assetResponse.status === 200) {
				return assetResponse;
			}
		} catch (_error) {
			console.log("Favicon not found");
		}
		return new Response("Favicon not found", { status: 404 });
	});

	const handleAgentsRoute = async (c: Context<{ Bindings: Env }>) => {
		const authHeader = c.req.header("Authorization");
		const authPayload = await AuthService.extractAuthFromHeader(
			authHeader,
			c.env
		);

		if (authPayload?.username && !authPayload?.isAdmin) {
			const rateLimitService = getLLMRateLimitService(c.env);
			const check = await rateLimitService.checkLimit(
				authPayload.username,
				authPayload.isAdmin ?? false
			);
			if (!check.allowed && check.nextResetAt) {
				const retryAfterSeconds = Math.ceil(
					(new Date(check.nextResetAt).getTime() - Date.now()) / 1000
				);
				c.header("Retry-After", String(Math.max(1, retryAfterSeconds)));
				return c.json(
					{
						error: check.reason ?? "Rate limit exceeded",
						nextResetAt: check.nextResetAt,
					},
					429
				);
			}
		}

		const modifiedRequest = AuthService.createRequestWithAuthContext(
			c.req.raw,
			authPayload
		);

		return (
			(await routeAgentRequest(modifiedRequest, c.env as any, {
				cors: true,
				prefix: "api/agents",
			})) || new Response("Agent route not found", { status: 404 })
		);
	};

	app.get(toApiRoutePath("/agents/*"), handleAgentsRoute);
	app.post(toApiRoutePath("/agents/*"), handleAgentsRoute);
	app.options(toApiRoutePath("/agents/*"), handleAgentsRoute);

	app.get("*", async (_c) => {
		return new Response("Route not found", { status: 404 });
	});
}
