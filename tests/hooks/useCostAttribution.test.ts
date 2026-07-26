// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	useCostAttribution,
	useTelemetryAlerts,
} from "@/hooks/useCostAttribution";
import { AuthService } from "@/services/core/auth-service";

const FROM = "2026-07-19T00:00:00.000Z";
const TO = "2026-07-26T00:00:00.000Z";

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as unknown as Response;
}

/** A non-2xx response whose body is not JSON — the parse-failure branch. */
function textResponse(body: string, status: number, statusText: string) {
	return {
		ok: false,
		status,
		statusText,
		json: async () => JSON.parse(body),
		text: async () => body,
	} as unknown as Response;
}

const ATTRIBUTION = { totals: { costUsd: 12.5 }, byAgent: [] };
const ALERTS = { alerts: [], thresholds: {}, lastUpdated: TO };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.spyOn(AuthService, "getStoredJwt").mockReturnValue("test-jwt");
	fetchMock = vi.fn().mockResolvedValue(jsonResponse(ATTRIBUTION));
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("useCostAttribution", () => {
	it("loads attribution for the requested window", async () => {
		const { result } = renderHook(() => useCostAttribution(FROM, TO));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.attribution).toEqual(ATTRIBUTION);
		expect(result.current.error).toBeNull();
	});

	it("sends the window as query params and the JWT as a bearer token", async () => {
		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain(`fromDate=${encodeURIComponent(FROM)}`);
		expect(String(url)).toContain(`toDate=${encodeURIComponent(TO)}`);
		expect((init as RequestInit).headers).toMatchObject({
			Authorization: "Bearer test-jwt",
		});
	});

	it("surfaces a missing JWT as an error instead of fetching", async () => {
		vi.spyOn(AuthService, "getStoredJwt").mockReturnValue(null);

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Authentication required");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports a 403 as an admin access error", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 403));

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Admin access required");
		expect(result.current.attribution).toBeNull();
	});

	it("surfaces the server's error message on a non-403 failure", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ error: "Database not configured" }, 500)
		);

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Database not configured");
	});

	it("falls back to the status text when the error body is not JSON", async () => {
		fetchMock.mockResolvedValue(
			textResponse("<html>gateway</html>", 502, "Bad Gateway")
		);

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Bad Gateway");
	});

	it("falls back to the status text when the JSON body has no error field", async () => {
		fetchMock.mockResolvedValue(jsonResponse({}, 500));

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Error");
	});

	it("wraps a non-Error rejection so callers always get an Error", async () => {
		fetchMock.mockRejectedValue("boom");

		const { result } = renderHook(() => useCostAttribution(FROM, TO));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Unknown error");
	});

	it("refetches when the window changes", async () => {
		const { result, rerender } = renderHook(
			({ from, to }) => useCostAttribution(from, to),
			{ initialProps: { from: FROM, to: TO } }
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetchMock).toHaveBeenCalledTimes(1);

		rerender({ from: "2026-06-01T00:00:00.000Z", to: TO });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	});
});

describe("useTelemetryAlerts", () => {
	it("loads alerts without a window", async () => {
		fetchMock.mockResolvedValue(jsonResponse(ALERTS));

		const { result } = renderHook(() => useTelemetryAlerts());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.alerts).toEqual(ALERTS);
		expect(String(fetchMock.mock.calls[0][0])).toContain(
			"/admin/telemetry/alerts"
		);
	});

	it("reports a 403 as an admin access error", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 403));

		const { result } = renderHook(() => useTelemetryAlerts());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Admin access required");
		expect(result.current.alerts).toBeNull();
	});

	it("surfaces a missing JWT as an error", async () => {
		vi.spyOn(AuthService, "getStoredJwt").mockReturnValue(null);

		const { result } = renderHook(() => useTelemetryAlerts());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error?.message).toBe("Authentication required");
	});
});
