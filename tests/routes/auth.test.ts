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

const mockAuthUserDAO = {
	getUserByUsername: vi.fn(),
	getUserByEmail: vi.fn(),
	createUser: vi.fn(),
	createVerificationToken: vi.fn(),
};
const mockDAOFactory = {
	authUserDAO: mockAuthUserDAO,
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDAOFactory),
}));

vi.mock("@/lib/env-utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env-utils")>();
	return {
		...actual,
		getEnvVar: vi.fn(async (env: any, name: string, required?: boolean) => {
			if (name === "RESEND_API_KEY" || name === "VERIFICATION_EMAIL_FROM") {
				return required === false ? "" : "test-value";
			}
			return (actual.getEnvVar as any)(env, name, required);
		}),
	};
});

vi.mock("@/lib/password", () => ({
	hashPassword: vi.fn(async () => "$2a$10$hashed"),
	verifyPassword: vi.fn(async () => true),
}));

import { app } from "@/server";
import { API_CONFIG } from "@/shared-config";
import { createRouteTestEnv } from "./test-env";

function getHeaders() {
	return { "CF-IPCountry": "US" };
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

describe("auth routes", () => {
	const env = createRouteTestEnv();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("POST /auth/register", () => {
		it("returns 400 for invalid body (missing fields)", async () => {
			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty("error");
		});

		it("returns 400 for invalid username format", async () => {
			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "x",
					password: "password123",
					email: "test@example.com",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 for short password", async () => {
			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "newuser",
					password: "short",
					email: "test@example.com",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 200 on successful registration", async () => {
			mockAuthUserDAO.getUserByUsername.mockResolvedValue(null);
			mockAuthUserDAO.getUserByEmail.mockResolvedValue(null);
			mockAuthUserDAO.createUser.mockResolvedValue(undefined);
			mockAuthUserDAO.createVerificationToken.mockResolvedValue(undefined);

			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "newuser",
					password: "password123",
					email: "test@example.com",
				}),
			});
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("success", true);
			expect(json).toHaveProperty("message");
		});

		it("returns 409 when username is taken", async () => {
			mockAuthUserDAO.getUserByUsername.mockResolvedValue({
				username: "existinguser",
			});
			mockAuthUserDAO.getUserByEmail.mockResolvedValue(null);

			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "existinguser",
					password: "password123",
					email: "new@example.com",
				}),
			});
			expect(res.status).toBe(409);
			const json = await res.json();
			expect(json.error).toContain("Username");
		});
	});

	describe("POST /auth/login", () => {
		it("returns 400 when username or password missing", async () => {
			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.LOGIN, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 401 for invalid credentials (user not found)", async () => {
			mockAuthUserDAO.getUserByUsername.mockResolvedValue(null);

			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.LOGIN, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "nonexistent",
					password: "password123",
				}),
			});
			expect(res.status).toBe(401);
			const json = await res.json();
			expect(json.error).toMatch(/Invalid|password/i);
		});

		it("returns 200 with token on successful login", async () => {
			mockAuthUserDAO.getUserByUsername.mockResolvedValue({
				username: "testuser",
				password_hash: "$2a$10$dummyhash",
				email_verified_at: new Date().toISOString(),
				is_admin: false,
			});

			const res = await fetchRoute(env, API_CONFIG.ENDPOINTS.AUTH.LOGIN, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...getHeaders(),
				},
				body: JSON.stringify({
					username: "testuser",
					password: "password123",
				}),
			});
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("token");
		});
	});

	describe("POST /api/auth/logout", () => {
		it("returns 200 on logout (no auth required)", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.AUTH.LOGOUT),
				{
					method: "POST",
					headers: getHeaders(),
				}
			);
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("success", true);
		});
	});
});
