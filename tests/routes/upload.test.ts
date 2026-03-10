import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevent loading modules that import cloudflare: protocol (not supported in Node/Vitest)
vi.mock("agents", () => ({
	routeAgentRequest: () =>
		Promise.resolve(new Response("Not found", { status: 404 })),
}));
vi.mock("@/durable-objects", () => ({
	Chat: class {},
	NotificationHub: class {},
}));
vi.mock("@/durable-objects/upload-session", () => ({
	UploadSessionDO: class {},
}));
vi.mock("@/durable-objects/chat", () => ({
	Chat: class {},
}));

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({})),
}));

import { app } from "@/server";
import { API_CONFIG } from "@/shared-config";
import { createRouteTestEnv, createTestJwt } from "./test-env";

function getHeaders(extra: Record<string, string> = {}) {
	return { "CF-IPCountry": "US", ...extra };
}

async function fetchRoute(
	env: ReturnType<typeof createRouteTestEnv>,
	path: string,
	options: RequestInit = {}
) {
	const url = `http://localhost${path.startsWith("/") ? path : `/${path}`}`;
	const req = new Request(url, {
		...options,
		headers: {
			...getHeaders(),
			...(options.headers as Record<string, string>),
		},
	});
	return app.fetch(req, env);
}

describe("upload routes", () => {
	const env = createRouteTestEnv();
	const uploadStatusPath = API_CONFIG.apiRoute(
		API_CONFIG.ENDPOINTS.UPLOAD.STATUS("testuser", "file.pdf")
	);

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset R2 mock to default (list succeeds, head returns null)
		(env.R2 as any).list = vi.fn().mockResolvedValue({ objects: [] });
		(env.R2 as any).head = vi.fn().mockResolvedValue(null);
	});

	describe("GET /api/upload/status/:tenant/:filename", () => {
		it("returns 401 without JWT", async () => {
			const res = await fetchRoute(env, uploadStatusPath, { method: "GET" });
			expect(res.status).toBe(401);
		});

		it("returns 503 when R2 is unavailable", async () => {
			(env.R2 as any).list = vi
				.fn()
				.mockRejectedValue(new Error("R2 unavailable"));
			const token = await createTestJwt(env.JWT_SECRET);

			const res = await fetchRoute(env, uploadStatusPath, {
				method: "GET",
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toMatch(/storage|available/i);
		});

		it("returns 200 with exists: false when file does not exist", async () => {
			const token = await createTestJwt(env.JWT_SECRET);

			const res = await fetchRoute(env, uploadStatusPath, {
				method: "GET",
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("success", true);
			expect(json).toHaveProperty("exists", false);
		});

		it("returns 200 with exists: true when file exists", async () => {
			const token = await createTestJwt(env.JWT_SECRET);
			(env.R2 as any).head = vi.fn().mockResolvedValue({
				size: 1024,
				httpMetadata: { contentType: "application/pdf" },
				uploaded: new Date(),
			});

			const res = await fetchRoute(env, uploadStatusPath, {
				method: "GET",
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("success", true);
			expect(json).toHaveProperty("exists", true);
			expect(json).toHaveProperty("metadata");
		});
	});
});
