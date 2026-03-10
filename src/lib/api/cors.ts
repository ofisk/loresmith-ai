/** Minimal env shape needed for CORS; compatible with worker bindings */
export interface CorsEnv {
	CORS_ALLOWED_ORIGINS?: string;
}

/**
 * Returns the value for Access-Control-Allow-Origin.
 * - If CORS_ALLOWED_ORIGINS is unset/empty: "*" (local dev fallback)
 * - Else: reflects request Origin if it's in the allowed list
 * - Origin not in list: undefined (caller should omit header; browser will block)
 */
export function getAccessControlAllowOrigin(
	request: Request,
	env: CorsEnv | Record<string, unknown>
): string | undefined {
	const allowed = (env as CorsEnv).CORS_ALLOWED_ORIGINS?.trim();
	if (!allowed) return "*";
	const origin = request.headers.get("Origin");
	if (!origin) return "*"; // same-origin / non-browser
	const list = new Set(allowed.split(",").map((o) => o.trim()));
	return list.has(origin) ? origin : undefined;
}

/** CORS headers for preflight and responses */
export function getCorsHeaders(
	request: Request,
	env: CorsEnv | Record<string, unknown>
): Record<string, string> {
	const origin = getAccessControlAllowOrigin(request, env);
	const headers: Record<string, string> = {
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-ID",
	};
	if (origin !== undefined) {
		headers["Access-Control-Allow-Origin"] = origin;
	}
	if (request.method === "OPTIONS") {
		headers["Access-Control-Max-Age"] = "86400";
	}
	return headers;
}
