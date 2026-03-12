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

const mockSubscriptionDAO = {
	getByUsername: vi.fn(),
	upsertByStripeSubscriptionId: vi.fn().mockResolvedValue(undefined),
};
const mockAuthUserDAO = {
	getUserByUsername: vi.fn(),
};
const mockUserMonthlyUsageDAO = { getCurrentMonthUsage: vi.fn() };
const mockUserCreditsDAO = { getCredits: vi.fn() };
const mockUserFreeTierUsageDAO = {
	getLifetimeUsage: vi.fn().mockResolvedValue(0),
	incrementUsage: vi.fn().mockResolvedValue(undefined),
};
const mockDAOFactory = {
	subscriptionDAO: mockSubscriptionDAO,
	authUserDAO: mockAuthUserDAO,
	userMonthlyUsageDAO: mockUserMonthlyUsageDAO,
	userCreditsDAO: mockUserCreditsDAO,
	userFreeTierUsageDAO: mockUserFreeTierUsageDAO,
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDAOFactory),
}));

const mockGetTier = vi.fn();
const mockGetTierLimits = vi.fn();
vi.mock("@/services/billing/subscription-service", () => ({
	getSubscriptionService: vi.fn(() => ({
		getTier: mockGetTier,
		getTierLimits: mockGetTierLimits.mockReturnValue({
			maxCampaigns: 5,
			maxFiles: 100,
			storageBytes: 1e9,
			tph: 100,
			qph: 50,
			tpd: 1000,
			qpd: 500,
			monthlyTokens: undefined,
			resourcesPerCampaignPerHour: 10,
		}),
	})),
}));

vi.mock("@/lib/env-utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/env-utils")>();
	return {
		...actual,
		getEnvVar: vi.fn(async (env: any, name: string, required?: boolean) => {
			if (name === "STRIPE_WEBHOOK_SECRET") {
				return "whsec_test";
			}
			if (name === "STRIPE_SECRET_KEY") {
				return required === false ? "" : "sk_test";
			}
			return (actual.getEnvVar as any)(env, name, required);
		}),
	};
});

import Stripe from "stripe";
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

describe("billing routes", () => {
	const env = createRouteTestEnv();

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetTier.mockResolvedValue("free");
		mockSubscriptionDAO.getByUsername.mockResolvedValue(null);
		mockAuthUserDAO.getUserByUsername.mockResolvedValue({
			username: "test-user",
			email: "test@example.com",
		});
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(0);
		mockUserCreditsDAO.getCredits.mockResolvedValue(0);
	});

	describe("GET /api/billing/status", () => {
		it("returns 401 without JWT", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.STATUS),
				{ method: "GET" }
			);
			expect(res.status).toBe(401);
		});

		it("returns 200 with valid JWT", async () => {
			const token = await createTestJwt(env.JWT_SECRET);
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.STATUS),
				{
					method: "GET",
					headers: { Authorization: `Bearer ${token}` },
				}
			);
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("tier");
			expect(json).toHaveProperty("limits");
		});
	});

	describe("POST /api/billing/webhook", () => {
		it("returns 400 when Stripe-Signature header is missing", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: "checkout.session.completed" }),
				}
			);
			expect(res.status).toBe(400);
			const json = (await res.json()) as { error?: string };
			expect(json.error).toMatch(/signature|Stripe/i);
		});

		it("returns 400 for invalid Stripe signature", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Stripe-Signature": "invalid_signature",
					},
					body: JSON.stringify({ type: "checkout.session.completed" }),
				}
			);
			expect(res.status).toBe(400);
		});

		it("returns 200 for valid Stripe webhook event", async () => {
			const payload = JSON.stringify({
				id: "evt_test",
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: "sub_test",
						status: "canceled",
						current_period_end: null,
					},
				},
			});
			const webhookSecret = "whsec_test";
			const stripe = new Stripe("sk_test");
			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: webhookSecret,
			});

			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Stripe-Signature": signature,
					},
					body: payload,
				}
			);
			expect(res.status).toBe(200);
		});
	});
});
