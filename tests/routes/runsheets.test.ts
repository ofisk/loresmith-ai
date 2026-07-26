import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignAccessDeniedError } from "@/lib/errors";
import type { RunsheetData } from "@/types/runsheet";

const getRunsheetById = vi.fn();
const listRunsheetsByCampaign = vi.fn();
const createRunsheet = vi.fn();
const updateRunsheet = vi.fn();
const deleteRunsheet = vi.fn();
const getNextSessionNumber = vi.fn();

const ensureCampaignAccess = vi.fn();
const requireCanEdit = vi.fn();
const requireCanSeeSpoilers = vi.fn();
const verifyCampaignAccess = vi.fn();
const assemble = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: () => ({
		runsheetDAO: {
			getRunsheetById,
			listRunsheetsByCampaign,
			createRunsheet,
			updateRunsheet,
			deleteRunsheet,
		},
		sessionDigestDAO: { getNextSessionNumber },
	}),
}));

vi.mock("@/lib/route-utils", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/route-utils")>(
			"@/lib/route-utils"
		);
	return {
		...actual,
		ensureCampaignAccess: (...args: unknown[]) => ensureCampaignAccess(...args),
		requireCanEdit: (...args: unknown[]) => requireCanEdit(...args),
		requireCanSeeSpoilers: (...args: unknown[]) =>
			requireCanSeeSpoilers(...args),
		verifyCampaignAccess: (...args: unknown[]) => verifyCampaignAccess(...args),
		getUserAuth: () => ({ username: "gm-user" }),
	};
});

vi.mock("@/services/campaign/runsheet-assembly-service", () => ({
	RunsheetAssemblyService: {
		assemble: (...args: unknown[]) => assemble(...args),
	},
}));

const {
	handleDeleteRunsheet,
	handleExportRunsheetHtml,
	handleGenerateRunsheet,
	handleGetRunsheet,
	handleListRunsheets,
	handleUpdateRunsheet,
} = await import("@/routes/runsheets");

const emptyRunsheetData: RunsheetData = {
	recap: {
		fromSessionNumber: null,
		keyEvents: [],
		stateChanges: { factions: [], locations: [], npcs: [] },
		source: null,
	},
	plan: {
		objectives: [],
		probablePlayerGoals: [],
		beats: [],
		ifThenBranches: [],
		openTasks: [],
		todoChecklist: [],
		source: null,
	},
	cast: [],
	encounters: [],
	loot: [],
	rules: [],
	openThreads: [],
	notes: "",
	emptySections: [],
};

const storedRunsheet = {
	id: "runsheet-1",
	campaignId: "campaign-1",
	sessionNumber: 3,
	title: "Session 3 runsheet",
	runsheetData: emptyRunsheetData,
	generatedAt: "2026-07-01 12:00:00",
	createdAt: "2026-07-01 12:00:00",
	updatedAt: "2026-07-01 12:00:00",
};

/**
 * Minimal Hono-shaped context that records what the handler responded with.
 *
 * `json`/`body` return real `Response` objects because the handlers rely on
 * `instanceof Response` to distinguish an early error response from loaded data.
 */
function createContext(
	params: Record<string, string>,
	options: { body?: unknown; query?: Record<string, string> } = {}
) {
	const captured: {
		status?: number;
		payload?: unknown;
		body?: string;
		headers?: Record<string, string>;
	} = {};
	return {
		captured,
		context: {
			req: {
				param: (name: string) => params[name],
				query: (name: string) => options.query?.[name],
				json: async () => options.body ?? {},
			},
			env: { DB: {} },
			json: (payload: unknown, status = 200) => {
				captured.payload = payload;
				captured.status = status;
				return new Response(JSON.stringify(payload), {
					status,
					headers: { "content-type": "application/json" },
				});
			},
			body: (body: string, status = 200, headers?: Record<string, string>) => {
				captured.body = body;
				captured.status = status;
				captured.headers = headers;
				return new Response(body, { status, headers });
			},
		} as never,
	};
}

describe("runsheet routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureCampaignAccess.mockResolvedValue(true);
		requireCanEdit.mockResolvedValue("owner");
		requireCanSeeSpoilers.mockResolvedValue("owner");
		verifyCampaignAccess.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Ashen Coast",
			campaignRagBasePath: "campaigns/campaign-1",
			role: "owner",
		});
		getRunsheetById.mockResolvedValue(storedRunsheet);
		listRunsheetsByCampaign.mockResolvedValue([]);
		getNextSessionNumber.mockResolvedValue(3);
		assemble.mockResolvedValue(emptyRunsheetData);
	});

	// The whole point of the spoiler boundary: player roles are rejected by
	// requireCanSeeSpoilers / requireCanEdit, which throw CampaignAccessDeniedError.
	describe("spoiler boundary", () => {
		it.each([
			["get", handleGetRunsheet, requireCanSeeSpoilers],
			["list", handleListRunsheets, requireCanSeeSpoilers],
			["export", handleExportRunsheetHtml, requireCanSeeSpoilers],
			["generate", handleGenerateRunsheet, requireCanEdit],
			["update", handleUpdateRunsheet, requireCanEdit],
			["delete", handleDeleteRunsheet, requireCanEdit],
		])("returns 403 from %s for a role without access", async (_name, handler, guard) => {
			expect.hasAssertions();

			(guard as ReturnType<typeof vi.fn>).mockRejectedValue(
				new CampaignAccessDeniedError()
			);

			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handler(context);

			expect(captured.status).toBe(403);
			expect(captured.payload).toEqual({ error: "Access denied" });
		});

		it("gates every read path on spoiler access, not merely campaign access", async () => {
			expect.hasAssertions();

			const { context } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleGetRunsheet(context);
			await handleExportRunsheetHtml(context);

			expect(requireCanSeeSpoilers).toHaveBeenCalledTimes(2);
		});
	});

	describe("handleGenerateRunsheet", () => {
		it("assembles a snapshot for the next session by default", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext({ campaignId: "campaign-1" });

			await handleGenerateRunsheet(context);

			expect(assemble).toHaveBeenCalledWith(expect.anything(), {
				campaignId: "campaign-1",
				sessionNumber: 3,
			});
			expect(createRunsheet).toHaveBeenCalled();
			expect(captured.status).toBe(201);
		});

		it("honours an explicit session number", async () => {
			expect.hasAssertions();

			const { context } = createContext(
				{ campaignId: "campaign-1" },
				{ body: { sessionNumber: 9 } }
			);

			await handleGenerateRunsheet(context);

			expect(assemble).toHaveBeenCalledWith(expect.anything(), {
				campaignId: "campaign-1",
				sessionNumber: 9,
			});
		});

		it("titles the runsheet after its session when no title is given", async () => {
			expect.hasAssertions();

			const { context } = createContext({ campaignId: "campaign-1" });

			await handleGenerateRunsheet(context);

			expect(createRunsheet).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ title: "Session 3 runsheet" })
			);
		});

		it("404s when the campaign is not visible to the user", async () => {
			expect.hasAssertions();

			ensureCampaignAccess.mockResolvedValue(false);
			const { context, captured } = createContext({ campaignId: "campaign-1" });

			await handleGenerateRunsheet(context);

			expect(captured.status).toBe(404);
			expect(createRunsheet).not.toHaveBeenCalled();
		});
	});

	describe("handleGetRunsheet", () => {
		it("returns the stored snapshot", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleGetRunsheet(context);

			expect(captured.payload).toEqual({ runsheet: storedRunsheet });
		});

		// Answering 404 avoids confirming the runsheet exists to someone probing ids.
		it("404s for a runsheet belonging to another campaign", async () => {
			expect.hasAssertions();

			getRunsheetById.mockResolvedValue({
				...storedRunsheet,
				campaignId: "other-campaign",
			});
			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleGetRunsheet(context);

			expect(captured.status).toBe(404);
			expect(captured.payload).toEqual({ error: "Runsheet not found" });
		});

		it("404s when the runsheet does not exist", async () => {
			expect.hasAssertions();

			getRunsheetById.mockResolvedValue(null);
			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "missing",
			});

			await handleGetRunsheet(context);

			expect(captured.status).toBe(404);
		});
	});

	describe("handleUpdateRunsheet", () => {
		it("persists hand-edited runsheet data", async () => {
			expect.hasAssertions();

			const edited = { ...emptyRunsheetData, notes: "Remember the bell" };
			const { context } = createContext(
				{ campaignId: "campaign-1", runsheetId: "runsheet-1" },
				{ body: { runsheetData: edited } }
			);

			await handleUpdateRunsheet(context);

			expect(updateRunsheet).toHaveBeenCalledWith("runsheet-1", {
				runsheetData: edited,
			});
		});

		it("rejects a body that is not a valid runsheet", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext(
				{ campaignId: "campaign-1", runsheetId: "runsheet-1" },
				{ body: { runsheetData: { recap: {} } } }
			);

			await handleUpdateRunsheet(context);

			expect(captured.status).toBe(400);
			expect(updateRunsheet).not.toHaveBeenCalled();
		});

		it("rejects an empty title", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext(
				{ campaignId: "campaign-1", runsheetId: "runsheet-1" },
				{ body: { title: "   " } }
			);

			await handleUpdateRunsheet(context);

			expect(captured.status).toBe(400);
			expect(updateRunsheet).not.toHaveBeenCalled();
		});

		it("rejects a request with no updatable fields", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext(
				{ campaignId: "campaign-1", runsheetId: "runsheet-1" },
				{ body: {} }
			);

			await handleUpdateRunsheet(context);

			expect(captured.status).toBe(400);
			expect(captured.payload).toEqual({ error: "No fields to update" });
		});

		// A snapshot the GM has edited must not be overwritten by fresher data.
		it("never re-assembles on update", async () => {
			expect.hasAssertions();

			const { context } = createContext(
				{ campaignId: "campaign-1", runsheetId: "runsheet-1" },
				{ body: { title: "My runsheet" } }
			);

			await handleUpdateRunsheet(context);

			expect(assemble).not.toHaveBeenCalled();
		});
	});

	describe("handleDeleteRunsheet", () => {
		it("deletes an existing runsheet", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleDeleteRunsheet(context);

			expect(deleteRunsheet).toHaveBeenCalledWith("runsheet-1");
			expect(captured.payload).toEqual({ success: true });
		});

		it("does not delete across campaigns", async () => {
			expect.hasAssertions();

			getRunsheetById.mockResolvedValue({
				...storedRunsheet,
				campaignId: "other-campaign",
			});
			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleDeleteRunsheet(context);

			expect(captured.status).toBe(404);
			expect(deleteRunsheet).not.toHaveBeenCalled();
		});
	});

	describe("handleExportRunsheetHtml", () => {
		it("returns a print-friendly HTML document", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleExportRunsheetHtml(context);

			expect(captured.status).toBe(200);
			expect(captured.body?.startsWith("<!DOCTYPE html>")).toBe(true);
			expect(captured.body).toContain("Ashen Coast");
			expect(captured.body).toContain("GM only — contains spoilers");
		});

		it("marks the response un-cacheable and un-indexable", async () => {
			expect.hasAssertions();

			const { context, captured } = createContext({
				campaignId: "campaign-1",
				runsheetId: "runsheet-1",
			});

			await handleExportRunsheetHtml(context);

			expect(captured.headers?.["Content-Type"]).toBe(
				"text/html; charset=utf-8"
			);
			expect(captured.headers?.["Cache-Control"]).toBe("no-store, private");
			expect(captured.headers?.["X-Robots-Tag"]).toBe("noindex, nofollow");
			expect(captured.headers?.["X-Content-Type-Options"]).toBe("nosniff");
		});
	});

	describe("handleListRunsheets", () => {
		it("returns summaries plus the next session number", async () => {
			expect.hasAssertions();

			listRunsheetsByCampaign.mockResolvedValue([
				{ id: "runsheet-1", sessionNumber: 3 },
			]);
			const { context, captured } = createContext({ campaignId: "campaign-1" });

			await handleListRunsheets(context);

			expect(captured.payload).toEqual({
				runsheets: [{ id: "runsheet-1", sessionNumber: 3 }],
				nextSessionNumber: 3,
			});
		});

		it("filters by session number when the query param is present", async () => {
			expect.hasAssertions();

			const { context } = createContext(
				{ campaignId: "campaign-1" },
				{ query: { sessionNumber: "5" } }
			);

			await handleListRunsheets(context);

			expect(listRunsheetsByCampaign).toHaveBeenCalledWith("campaign-1", {
				sessionNumber: 5,
			});
		});

		it("ignores a non-numeric session filter", async () => {
			expect.hasAssertions();

			const { context } = createContext(
				{ campaignId: "campaign-1" },
				{ query: { sessionNumber: "abc" } }
			);

			await handleListRunsheets(context);

			expect(listRunsheetsByCampaign).toHaveBeenCalledWith("campaign-1", {
				sessionNumber: undefined,
			});
		});
	});
});
