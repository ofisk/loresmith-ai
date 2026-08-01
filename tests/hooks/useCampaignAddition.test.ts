// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("@/services/core/auth-service", () => ({
	authenticatedFetchWithExpiration: mockFetch,
}));

import { renderHook } from "@testing-library/react";
import { useCampaignAddition } from "@/hooks/useCampaignAddition";

const file = {
	id: "library/gm/book.pdf",
	file_key: "library/gm/book.pdf",
	file_name: "book.pdf",
	file_size: 10,
	status: "processing",
	created_at: "",
	updated_at: "",
	campaigns: [],
} as any;

function okResponse(body: unknown) {
	return {
		jwtExpired: false,
		response: {
			ok: true,
			status: 200,
			json: async () => body,
			text: async () => JSON.stringify(body),
		},
	};
}

describe("useCampaignAddition — deferred adds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reports a queued add when the server defers it", async () => {
		mockFetch.mockResolvedValue(
			okResponse({ success: true, resource: { id: "r1" }, pending: true })
		);
		const notify = vi.fn();
		const { result } = renderHook(() => useCampaignAddition());

		await result.current.addFileToCampaigns(
			file,
			["campaign-1"],
			() => "jwt",
			notify
		);

		const [type, title, message] = notify.mock.calls.at(-1) ?? [];
		expect(type).toBe("success");
		expect(title).toBe("Queued until processing finishes");
		expect(message).toMatch(/still processing/i);
		expect(message).toMatch(/shards will appear for approval/i);
	});

	it("reports a normal add when the server completes it", async () => {
		mockFetch.mockResolvedValue(
			okResponse({ success: true, resource: { id: "r1" }, pending: false })
		);
		const notify = vi.fn();
		const { result } = renderHook(() => useCampaignAddition());

		await result.current.addFileToCampaigns(
			file,
			["campaign-1"],
			() => "jwt",
			notify
		);

		const [, title] = notify.mock.calls.at(-1) ?? [];
		expect(title).toBe("File added to campaign");
	});

	it("distinguishes a partially queued multi-campaign add", async () => {
		mockFetch
			.mockResolvedValueOnce(
				okResponse({ success: true, resource: { id: "r1" }, pending: false })
			)
			.mockResolvedValueOnce(
				okResponse({ success: true, resource: { id: "r2" }, pending: true })
			);
		const notify = vi.fn();
		const { result } = renderHook(() => useCampaignAddition());

		await result.current.addFileToCampaigns(
			file,
			["campaign-1", "campaign-2"],
			() => "jwt",
			notify
		);

		const [, title, message] = notify.mock.calls.at(-1) ?? [];
		expect(title).toBe("Queued until processing finishes");
		expect(message).toMatch(/added to 1 campaign\(s\)/);
		expect(message).toMatch(/queued for 1 more/);
	});
});
