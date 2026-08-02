// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	useAdminExperiments,
	useExperimentResults,
} from "@/hooks/useAdminExperiments";
import { AuthService } from "@/services/core/auth-service";
import type { Experiment } from "@/types/experiments";

function experiment(key: string): Experiment {
	return {
		key,
		description: "",
		status: "off",
		rolloutPct: 0,
		variants: ["control", "treatment"],
		createdAt: "2026-01-01 00:00:00",
		updatedAt: "2026-01-01 00:00:00",
		updatedBy: "ofisk",
	};
}

function jsonResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.spyOn(AuthService, "getStoredJwt").mockReturnValue("fake-jwt");
	fetchMock = vi
		.fn()
		.mockResolvedValue(jsonResponse({ experiments: [experiment("flagA")] }));
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("useAdminExperiments", () => {
	it("loads the list on mount", async () => {
		const { result } = renderHook(() => useAdminExperiments());

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.experiments.map((e) => e.key)).toEqual(["flagA"]);
		expect(result.current.error).toBeNull();
	});

	it("sends the bearer token", async () => {
		renderHook(() => useAdminExperiments());

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [, init] = fetchMock.mock.calls[0];
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer fake-jwt"
		);
	});

	it("surfaces a 403 as an admin-access error", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 403));

		const { result } = renderHook(() => useAdminExperiments());

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error?.message).toBe("Admin access required");
	});

	it("surfaces the server's error message for other failures", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ error: 'Experiment "flagA" already exists' }, 409)
		);

		const { result } = renderHook(() => useAdminExperiments());

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error?.message).toBe(
			'Experiment "flagA" already exists'
		);
	});

	it("errors when there is no stored JWT", async () => {
		vi.spyOn(AuthService, "getStoredJwt").mockReturnValue(null);

		const { result } = renderHook(() => useAdminExperiments());

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error?.message).toBe("Authentication required");
	});

	it("re-lists after a create rather than patching local state", async () => {
		const { result } = renderHook(() => useAdminExperiments());
		await waitFor(() => expect(result.current.loading).toBe(false));
		fetchMock.mockClear();

		fetchMock
			.mockResolvedValueOnce(jsonResponse({ experiment: experiment("flagB") }))
			.mockResolvedValueOnce(
				jsonResponse({
					experiments: [experiment("flagA"), experiment("flagB")],
				})
			);

		await act(async () => {
			await result.current.createExperiment({ key: "flagB" });
		});

		// POST then GET: the server normalizes what it stores, so an optimistic
		// local copy would show numbers the database does not hold.
		expect(fetchMock.mock.calls[0][1].method).toBe("POST");
		expect(fetchMock.mock.calls[1][1]?.method).toBeUndefined();
		expect(result.current.experiments.map((e) => e.key)).toEqual([
			"flagA",
			"flagB",
		]);
	});

	it("PATCHes an update to the key's URL", async () => {
		const { result } = renderHook(() => useAdminExperiments());
		await waitFor(() => expect(result.current.loading).toBe(false));
		fetchMock.mockClear();
		fetchMock.mockResolvedValue(jsonResponse({ experiments: [] }));

		await act(async () => {
			await result.current.updateExperiment("flagA", { rolloutPct: 25 });
		});

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain("/admin/experiments/flagA");
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(init.body)).toEqual({ rolloutPct: 25 });
	});

	it("DELETEs and re-lists", async () => {
		const { result } = renderHook(() => useAdminExperiments());
		await waitFor(() => expect(result.current.loading).toBe(false));
		fetchMock.mockClear();
		fetchMock.mockResolvedValue(jsonResponse({ experiments: [] }));

		await act(async () => {
			await result.current.deleteExperiment("flagA");
		});

		expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
		expect(result.current.experiments).toEqual([]);
	});
});

describe("useExperimentResults", () => {
	it("fetches nothing until a key is given", () => {
		const { result } = renderHook(() => useExperimentResults(null));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current.results).toBeNull();
	});

	it("loads per-arm exposures for a key", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				key: "split",
				fromDate: "2026-01-01T00:00:00.000Z",
				exposures: [
					{ variant: "control", exposures: 10 },
					{ variant: "treatment", exposures: 12 },
				],
			})
		);

		const { result } = renderHook(() => useExperimentResults("split"));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.results?.exposures).toHaveLength(2);
	});

	it("surfaces a failure without throwing", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

		const { result } = renderHook(() => useExperimentResults("split"));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error?.message).toBe("boom");
		expect(result.current.results).toBeNull();
	});
});
