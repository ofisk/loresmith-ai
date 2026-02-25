import type { Context } from "hono";
import { jwtVerify } from "jose";
import { extractJwtFromHeader } from "@/lib/auth-utils";
import { type EnvWithSecrets, getEnvVar } from "@/lib/env-utils";
import type { AuthEnv, AuthPayload } from "@/services/core/auth-service";

export interface Env extends AuthEnv, EnvWithSecrets {
	R2: R2Bucket;
	DB: D1Database;
	VECTORIZE: VectorizeIndex;
	AI: Ai;
	CHAT: DurableObjectNamespace;
	NOTIFICATIONS: DurableObjectNamespace;
	UPLOAD_SESSION: DurableObjectNamespace;
	ASSETS: Fetcher;
	FILE_PROCESSING_QUEUE: Queue;
	FILE_PROCESSING_DLQ: Queue;
	GRAPH_REBUILD_QUEUE: Queue;
}

// Set user authentication data in context
export function setUserAuth(c: Context, payload: AuthPayload) {
	c.set("userAuth", payload);
}

// Middleware to require valid JWT token
export async function requireUserJwt(
	c: Context<{ Bindings: Env }>,
	next: () => Promise<void>
): Promise<Response | undefined> {
	const authHeader = c.req.header("Authorization");
	const token = extractJwtFromHeader(authHeader);

	if (!token) {
		return c.json({ error: "Authorization header required" }, 401);
	}

	try {
		const secret = await getEnvVar(c.env, "JWT_SECRET");
		const jwtSecret = new TextEncoder().encode(secret);

		const { payload } = await jwtVerify(token, jwtSecret);

		if (payload.type !== "user-auth") {
			return c.json({ error: "Invalid token type" }, 401);
		}

		const userAuth = payload as AuthPayload;

		setUserAuth(c, userAuth);
		await next();
	} catch (error) {
		console.error("[requireUserJwt] JWT verification failed:", error);
		return c.json(
			{
				error:
					error instanceof Error &&
					(error.name === "EnvironmentVariableError" ||
						/JWT_SECRET/i.test(error.message))
						? "Authentication is not configured on the server."
						: "Invalid token",
			},
			error instanceof Error &&
				(error.name === "EnvironmentVariableError" ||
					/JWT_SECRET/i.test(error.message))
				? 500
				: 401
		);
	}
}
