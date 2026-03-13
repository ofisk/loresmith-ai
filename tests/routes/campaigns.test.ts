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

const mockCampaignDAO = {
	getCampaignsByUser: vi.fn(),
	getCampaignsByUserWithMapping: vi.fn(),
	getCampaignByIdWithMapping: vi.fn(),
	getCampaignById: vi.fn(),
	deleteCampaign: vi.fn(),
};
const mockDAOFactory = {
	campaignDAO: mockCampaignDAO,
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

vi.mock("@/lib/campaign-operations", () => ({
	createCampaign: vi.fn().mockImplementation((opts: { name?: string }) =>
		Promise.resolve({
			id: "campaign-new",
			name: opts.name ?? "Test",
			description: "",
			username: "test-user",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
	),
}));

vi.mock("@/services/campaign/campaign-context-sync-service", () => ({
	CampaignContextSyncService: vi.fn().mockImplementation(function (this: any) {
		this.syncContext = vi.fn().mockResolvedValue(undefined);
	}),
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

describe("campaigns routes", () => {
	const env = createRouteTestEnv();

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetTier.mockResolvedValue("free");
		mockCampaignDAO.getCampaignsByUser.mockResolvedValue([]);
		mockCampaignDAO.getCampaignsByUserWithMapping.mockResolvedValue([]);
		mockCampaignDAO.getCampaignByIdWithMapping.mockResolvedValue(null);
		mockCampaignDAO.getCampaignById.mockResolvedValue(null);
		mockCampaignDAO.deleteCampaign.mockResolvedValue(undefined);
	});

	describe("GET /api/campaigns", () => {
		it("returns 401 without JWT", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST),
				{ method: "GET" }
			);
			expect(res.status).toBe(401);
		});

		it("returns 200 with empty list when authenticated", async () => {
			const token = await createTestJwt(env.JWT_SECRET);
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST),
				{
					method: "GET",
					headers: { Authorization: `Bearer ${token}` },
				}
			);
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("campaigns");
			expect(Array.isArray(json.campaigns)).toBe(true);
		});
	});

	describe("POST /api/campaigns", () => {
		it("returns 401 without JWT", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Test", description: "" }),
				}
			);
			expect(res.status).toBe(401);
		});

		it("returns 201 when creating campaign with valid JWT", async () => {
			const token = await createTestJwt(env.JWT_SECRET);
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: "Test campaign", description: "" }),
				}
			);
			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json).toHaveProperty("campaign");
			expect(json.campaign).toHaveProperty("name", "Test campaign");
		});

		it("returns 400 when name is missing", async () => {
			const token = await createTestJwt(env.JWT_SECRET);
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ description: "" }),
				}
			);
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/campaigns/:campaignId", () => {
		it("returns 401 without JWT", async () => {
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS("campaign-1")
				),
				{ method: "GET" }
			);
			expect(res.status).toBe(401);
		});

		it("returns 200 with campaign when authenticated", async () => {
			mockCampaignDAO.getCampaignByIdWithMapping = vi.fn().mockResolvedValue({
				id: "campaign-1",
				name: "My campaign",
				username: "test-user",
			});
			const token = await createTestJwt(env.JWT_SECRET);
			const res = await fetchRoute(
				env,
				API_CONFIG.apiRoute(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS("campaign-1")
				),
				{
					method: "GET",
					headers: { Authorization: `Bearer ${token}` },
				}
			);
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty("campaign");
		});
	});
});
