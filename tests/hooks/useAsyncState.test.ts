// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAsyncState } from "@/hooks/useAsyncState";

describe("useAsyncState", () => {
	it("initializes with provided data", () => {
		const { result } = renderHook(() => useAsyncState({ count: 0 }));
		expect(result.current[0].data).toEqual({ count: 0 });
		expect(result.current[0].loading).toBe(false);
		expect(result.current[0].error).toBe(null);
		expect(result.current[0].lastUpdated).toBe(0);
	});

	it("setLoading updates loading state", () => {
		const { result } = renderHook(() => useAsyncState(null));
		expect(result.current[0].loading).toBe(false);
		act(() => result.current[1].setLoading(true));
		expect(result.current[0].loading).toBe(true);
		act(() => result.current[1].setLoading(false));
		expect(result.current[0].loading).toBe(false);
	});

	it("setData updates data, clears error, and sets lastUpdated", () => {
		const { result } = renderHook(() => useAsyncState<string | null>(null));
		act(() => result.current[1].setError("err"));
		expect(result.current[0].error).toBe("err");
		act(() => result.current[1].setData("ok"));
		expect(result.current[0].data).toBe("ok");
		expect(result.current[0].error).toBe(null);
		expect(result.current[0].loading).toBe(false);
		expect(result.current[0].lastUpdated).toBeGreaterThan(0);
	});

	it("setError updates error and clears loading", () => {
		const { result } = renderHook(() => useAsyncState(null));
		act(() => result.current[1].setLoading(true));
		act(() => result.current[1].setError("failed"));
		expect(result.current[0].error).toBe("failed");
		expect(result.current[0].loading).toBe(false);
		expect(result.current[0].lastUpdated).toBeGreaterThan(0);
	});

	it("reset restores initial state", () => {
		const initial = { value: 1 };
		const { result } = renderHook(() => useAsyncState(initial));
		act(() => result.current[1].setData({ value: 2 }));
		act(() => result.current[1].setError("err"));
		expect(result.current[0].data).toEqual({ value: 2 });
		expect(result.current[0].error).toBe("err");
		act(() => result.current[1].reset());
		expect(result.current[0].data).toEqual(initial);
		expect(result.current[0].loading).toBe(false);
		expect(result.current[0].error).toBe(null);
		expect(result.current[0].lastUpdated).toBe(0);
	});
});
