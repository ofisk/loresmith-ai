// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBaseAsync, useBaseAsyncVoid } from "@/hooks/useBaseAsync";

describe("useBaseAsync", () => {
	it("initializes with null data and no loading/error", () => {
		const fn = vi.fn();
		const { result } = renderHook(() => useBaseAsync(fn));
		expect(result.current.data).toBe(null);
		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it("sets loading then data on success", async () => {
		const fn = vi.fn().mockResolvedValue(42);
		const { result } = renderHook(() => useBaseAsync(fn));
		let p: Promise<number>;
		act(() => {
			p = result.current.execute();
		});
		expect(result.current.loading).toBe(true);
		await act(async () => {
			await p!;
		});
		expect(result.current.data).toBe(42);
		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it("sets error on failure", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("failed"));
		const { result } = renderHook(() => useBaseAsync(fn));
		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// expected
			}
		});
		expect(result.current.error).toBe("failed");
		expect(result.current.loading).toBe(false);
	});

	it("calls onSuccess with result", async () => {
		const onSuccess = vi.fn();
		const fn = vi.fn().mockResolvedValue("ok");
		const { result } = renderHook(() => useBaseAsync(fn, { onSuccess }));
		await act(async () => {
			await result.current.execute();
		});
		expect(onSuccess).toHaveBeenCalledWith("ok");
	});

	it("calls onError on failure", async () => {
		const onError = vi.fn();
		const fn = vi.fn().mockRejectedValue(new Error("err"));
		const { result } = renderHook(() => useBaseAsync(fn, { onError }));
		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// expected
			}
		});
		expect(onError).toHaveBeenCalledWith("err");
	});

	it("reset clears data, error, loading", async () => {
		const fn = vi.fn().mockResolvedValue(1);
		const { result } = renderHook(() => useBaseAsync(fn));
		await act(async () => {
			await result.current.execute();
		});
		expect(result.current.data).toBe(1);
		act(() => result.current.reset());
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	it("retry returns execute function", () => {
		const fn = vi.fn();
		const { result } = renderHook(() => useBaseAsync(fn));
		expect(typeof result.current.retry).toBe("function");
	});

	it("retry with autoExecute re-runs with autoExecuteArgs", async () => {
		const fn = vi.fn().mockResolvedValue(99);
		const { result } = renderHook(() =>
			useBaseAsync(fn, {
				autoExecute: true,
				autoExecuteArgs: ["arg1"] as [string],
			})
		);
		await act(async () => {
			await result.current.execute("first");
		});
		expect(result.current.data).toBe(99);
		act(() => result.current.setError("err"));
		await act(async () => {
			await result.current.retry();
		});
		expect(fn).toHaveBeenLastCalledWith("arg1");
	});

	it("setError allows manual error update", () => {
		const fn = vi.fn();
		const { result } = renderHook(() => useBaseAsync(fn));
		act(() => result.current.setError("manual"));
		expect(result.current.error).toBe("manual");
	});
});

describe("useBaseAsyncVoid", () => {
	it("wraps useBaseAsync for void operations", async () => {
		const fn = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useBaseAsyncVoid(fn));
		await act(async () => {
			await result.current.execute();
		});
		expect(result.current.loading).toBe(false);
		expect(fn).toHaveBeenCalled();
	});
});
