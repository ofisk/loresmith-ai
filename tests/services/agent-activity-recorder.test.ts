import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingAgentActivityWrite } from "@/dao/agent-activity-dao";
import {
	AGENT_ACTIVITY_ENV,
	AgentActivityRecorder,
	isAgentActivityLoggingEnabled,
	isSuccessfulToolResult,
	recordAgentActivity,
} from "@/services/agent-activity/agent-activity-recorder";
import { AGENT_ACTIVITY_STATUS } from "@/types/agent-activity";

const saveMany = vi.fn<(rows: PendingAgentActivityWrite[]) => Promise<void>>();

vi.mock("@/dao/agent-activity-dao", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/dao/agent-activity-dao")>();
	return {
		...actual,
		AgentActivityDAO: class {
			saveMany(rows: PendingAgentActivityWrite[]) {
				return saveMany(rows);
			}
		},
	};
});

const DB = {} as D1Database;
const ENV = { DB } as unknown as Record<string, unknown>;

const CONTEXT = {
	username: "gm",
	agentType: "campaign",
	campaignId: "camp-1",
	sessionId: "do-1",
};

/** Every row handed to the DAO across all flushes, in write order. */
function writtenRows(): PendingAgentActivityWrite[] {
	return saveMany.mock.calls.flatMap((call) => call[0]);
}

/** Latest state written for a given id. */
function latest(id: string): PendingAgentActivityWrite | undefined {
	return writtenRows()
		.filter((row) => row.id === id)
		.at(-1);
}

describe("isAgentActivityLoggingEnabled", () => {
	it("defaults to on so agents are logged without configuration", () => {
		expect(isAgentActivityLoggingEnabled({})).toBe(true);
		expect(isAgentActivityLoggingEnabled(undefined)).toBe(true);
	});

	it("is a kill switch: any falsy value turns it off without a deploy", () => {
		for (const value of ["0", "false", "no", "off", "OFF"]) {
			expect(
				isAgentActivityLoggingEnabled({ [AGENT_ACTIVITY_ENV]: value })
			).toBe(false);
		}
		expect(isAgentActivityLoggingEnabled({ [AGENT_ACTIVITY_ENV]: false })).toBe(
			false
		);
	});
});

describe("AgentActivityRecorder.create", () => {
	it("returns null without a D1 binding", () => {
		expect(AgentActivityRecorder.create({}, CONTEXT)).toBeNull();
	});

	it("returns null when the kill switch is thrown", () => {
		expect(
			AgentActivityRecorder.create(
				{ ...ENV, [AGENT_ACTIVITY_ENV]: "false" },
				CONTEXT
			)
		).toBeNull();
	});

	it("returns null on an unauthenticated turn", () => {
		// A row is authorized by its username; one without an owner could never be
		// read back, so writing it would only cost storage.
		expect(
			AgentActivityRecorder.create(ENV, { ...CONTEXT, username: null })
		).toBeNull();
	});

	it("returns null without a session to attribute the work to", () => {
		expect(
			AgentActivityRecorder.create(ENV, { ...CONTEXT, sessionId: "" })
		).toBeNull();
	});
});

describe("AgentActivityRecorder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		saveMany.mockResolvedValue(undefined);
	});

	it("records a completed action with duration and redacted input", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		const id = recorder.begin({
			actionType: "tool_call",
			toolName: "listCampaigns",
			input: { jwt: "secret-token", campaignId: "camp-1" },
		});
		recorder.finish(id, {
			status: AGENT_ACTIVITY_STATUS.SUCCEEDED,
			result: { result: { success: true, message: "ok" } },
		});
		await recorder.settle();

		const row = latest(id);
		expect(row?.status).toBe("succeeded");
		expect(row?.toolName).toBe("listCampaigns");
		expect(row?.agentType).toBe("campaign");
		expect(row?.username).toBe("gm");
		expect(row?.summary?.input?.jwt).toBe("[redacted]");
		expect(row?.durationMs).toBeGreaterThanOrEqual(0);
		expect(row?.endedAt).not.toBeNull();
	});

	it("makes a root action its own tree root", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		const id = recorder?.begin({ actionType: "tool_call", toolName: "a" });
		await recorder?.settle();

		expect(latest(id as string)?.rootId).toBe(id);
		expect(latest(id as string)?.parentId).toBeNull();
	});

	it("coalesces a start and finish that land between flushes into one write", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		// No await between the two: this is the common case for a fast tool, and
		// the point of the buffer is that it costs one round trip, not two.
		const id = recorder.begin({ actionType: "tool_call", toolName: "a" });
		recorder.finish(id, { status: AGENT_ACTIVITY_STATUS.SUCCEEDED });
		await recorder.settle();

		expect(writtenRows().filter((row) => row.id === id)).toHaveLength(1);
		expect(latest(id)?.status).toBe("succeeded");
	});

	it("batches concurrent tool calls together rather than one write each", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		const ids = ["a", "b", "c"].map((toolName) =>
			recorder.begin({ actionType: "tool_call", toolName })
		);
		for (const id of ids) {
			recorder.finish(id, { status: AGENT_ACTIVITY_STATUS.SUCCEEDED });
		}
		await recorder.settle();

		expect(saveMany).toHaveBeenCalledTimes(1);
		expect(saveMany.mock.calls[0][0]).toHaveLength(3);
	});

	it("keeps a long-running action visible as running before it resolves", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		const id = recorder.begin({ actionType: "tool_call", toolName: "slow" });
		await recorder.settle();
		expect(latest(id)?.status).toBe("running");

		recorder.finish(id, { status: AGENT_ACTIVITY_STATUS.SUCCEEDED });
		await recorder.settle();
		expect(latest(id)?.status).toBe("succeeded");
	});

	it("truncates a long failure message", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		const id = recorder.begin({ actionType: "tool_call", toolName: "boom" });
		recorder.finish(id, {
			status: AGENT_ACTIVITY_STATUS.FAILED,
			error: new Error("x".repeat(5000)),
		});
		await recorder.settle();

		expect(latest(id)?.error?.length).toBeLessThanOrEqual(500);
	});

	it("ignores an unknown id rather than throwing inside a tool call", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		expect(() =>
			recorder?.finish("nope", { status: AGENT_ACTIVITY_STATUS.SUCCEEDED })
		).not.toThrow();
	});

	it("swallows a D1 failure — a lost log line must not fail the turn", async () => {
		saveMany.mockRejectedValue(new Error("D1 down"));
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!recorder) throw new Error("expected a recorder");

		recorder.begin({ actionType: "tool_call", toolName: "a" });
		await expect(recorder.settle()).resolves.toBeUndefined();
	});

	it("hangs a delegate's work under the delegating call", async () => {
		const parent = AgentActivityRecorder.create(ENV, CONTEXT);
		if (!parent) throw new Error("expected a recorder");

		const delegationId = parent.begin({
			actionType: "delegation",
			toolName: "askAnotherAgent",
		});
		const child = AgentActivityRecorder.create(
			ENV,
			parent.childContext(delegationId, "rules-reference")
		);
		const childId = child?.begin({
			actionType: "tool_call",
			toolName: "searchRules",
		});

		await parent.settle();
		await child?.settle();

		const childRow = latest(childId as string);
		expect(childRow?.parentId).toBe(delegationId);
		expect(childRow?.rootId).toBe(latest(delegationId)?.rootId);
		// Attributed to the delegate, which is what per-agent badges need.
		expect(childRow?.agentType).toBe("rules-reference");
		expect(childRow?.campaignId).toBe("camp-1");
	});
});

describe("isSuccessfulToolResult", () => {
	it("treats an explicit failure envelope as a failure", () => {
		expect(isSuccessfulToolResult({ result: { success: false } })).toBe(false);
		expect(isSuccessfulToolResult({ success: false })).toBe(false);
	});

	it("treats anything else as a success", () => {
		expect(isSuccessfulToolResult({ result: { success: true } })).toBe(true);
		expect(isSuccessfulToolResult("plain string")).toBe(true);
		expect(isSuccessfulToolResult(undefined)).toBe(true);
	});
});

describe("recordAgentActivity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		saveMany.mockResolvedValue(undefined);
	});

	it("runs the tool untouched when there is no recorder", async () => {
		const result = await recordAgentActivity(
			null,
			{ toolName: "a", input: {} },
			async (activityId) => {
				expect(activityId).toBeNull();
				return "value";
			}
		);
		expect(result).toBe("value");
		expect(saveMany).not.toHaveBeenCalled();
	});

	it("records a failure envelope as failed, not succeeded", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		await recordAgentActivity(
			recorder,
			{ toolName: "a", input: {} },
			async () => ({ result: { success: false, message: "blocked" } })
		);
		await recorder?.settle();

		expect(writtenRows().at(-1)?.status).toBe("failed");
	});

	it("records a thrown error as failed and rethrows it", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		await expect(
			recordAgentActivity(recorder, { toolName: "a", input: {} }, async () => {
				throw new Error("kaboom");
			})
		).rejects.toThrow("kaboom");
		await recorder?.settle();

		const row = writtenRows().at(-1);
		expect(row?.status).toBe("failed");
		expect(row?.error).toBe("kaboom");
	});

	it("classifies askAnotherAgent as a delegation", async () => {
		const recorder = AgentActivityRecorder.create(ENV, CONTEXT);
		await recordAgentActivity(
			recorder,
			{ toolName: "askAnotherAgent", input: {} },
			async () => ({ result: { success: true } })
		);
		await recorder?.settle();

		expect(writtenRows().at(-1)?.actionType).toBe("delegation");
	});
});
