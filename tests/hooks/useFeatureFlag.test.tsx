// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentProvider } from "@/contexts/ExperimentContext";
import {
	clearRuntimeAssignments,
	hasRuntimeAssignments,
	isFeatureEnabled,
} from "@/lib/feature-flags";
import { useFeatureFlag, useVariant } from "@/lib/feature-flags-react";
import { AuthService } from "@/services/core/auth-service";

function wrapper({ children }: { children: ReactNode }) {
	return <ExperimentProvider>{children}</ExperimentProvider>;
}

function mockAssignments(body: unknown, ok = true) {
	return vi.fn().mockResolvedValue({
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	});
}

beforeEach(() => {
	clearRuntimeAssignments();
	vi.spyOn(AuthService, "getStoredJwt").mockReturnValue("fake-jwt");
	vi.spyOn(AuthService, "isJwtExpired").mockReturnValue(false);
});

afterEach(() => {
	clearRuntimeAssignments();
	vi.restoreAllMocks();
});

describe("useFeatureFlag with a provider", () => {
	it("returns the server-resolved value once assignments land", async () => {
		vi.stubGlobal(
			"fetch",
			mockAssignments({
				assignments: { newDashboard: "treatment" },
				flags: { newDashboard: true },
			})
		);

		const { result } = renderHook(() => useFeatureFlag("newDashboard"), {
			wrapper,
		});

		await waitFor(() => expect(result.current).toBe(true));
	});

	it("returns the arm name from useVariant", async () => {
		vi.stubGlobal(
			"fetch",
			mockAssignments({
				assignments: { copyTest: "new-copy" },
				flags: { copyTest: true },
			})
		);

		const { result } = renderHook(() => useVariant("copyTest"), { wrapper });

		await waitFor(() => expect(result.current).toBe("new-copy"));
	});

	it("seeds the module cache so non-React callers agree", async () => {
		vi.stubGlobal(
			"fetch",
			mockAssignments({
				assignments: { newDashboard: "treatment" },
				flags: { newDashboard: true },
			})
		);

		renderHook(() => useFeatureFlag("newDashboard"), { wrapper });

		// `isFeatureEnabled` is the sync, non-React entry point; it must see the
		// same answer the hook does.
		await waitFor(() => expect(isFeatureEnabled("newDashboard")).toBe(true));
	});

	it("falls back to build-time flags when the fetch fails", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

		const { result } = renderHook(() => useFeatureFlag("newDashboard"), {
			wrapper,
		});

		// The point of the criterion: a network blip must leave the build-time
		// layer in charge, not write an all-false map that disables everything.
		await waitFor(() => expect(hasRuntimeAssignments()).toBe(false));
		expect(result.current).toBe(false);
	});

	it("falls back when the server returns a non-2xx", async () => {
		vi.stubGlobal("fetch", mockAssignments({ error: "boom" }, false));

		renderHook(() => useFeatureFlag("newDashboard"), { wrapper });

		await waitFor(() => expect(hasRuntimeAssignments()).toBe(false));
	});

	it("does not call the endpoint when logged out", async () => {
		vi.spyOn(AuthService, "getStoredJwt").mockReturnValue(null);
		const fetchMock = mockAssignments({ assignments: {}, flags: {} });
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useFeatureFlag("newDashboard"), {
			wrapper,
		});

		// Bucketing needs a username; pre-auth surfaces are a known v1 limit.
		await waitFor(() => expect(result.current).toBe(false));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not call the endpoint with an expired token", async () => {
		vi.spyOn(AuthService, "isJwtExpired").mockReturnValue(true);
		const fetchMock = mockAssignments({ assignments: {}, flags: {} });
		vi.stubGlobal("fetch", fetchMock);

		renderHook(() => useFeatureFlag("newDashboard"), { wrapper });

		await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
	});
});

describe("useFeatureFlag without a provider", () => {
	it("still resolves, so tests and stories need no extra wrapping", () => {
		const { result } = renderHook(() => useFeatureFlag("newDashboard"));
		expect(result.current).toBe(false);
	});

	it("reads the module cache when one has been seeded", async () => {
		vi.stubGlobal(
			"fetch",
			mockAssignments({
				assignments: { newDashboard: "treatment" },
				flags: { newDashboard: true },
			})
		);
		renderHook(() => useFeatureFlag("newDashboard"), { wrapper });
		await waitFor(() => expect(isFeatureEnabled("newDashboard")).toBe(true));

		const { result } = renderHook(() => useFeatureFlag("newDashboard"));
		expect(result.current).toBe(true);
	});
});
