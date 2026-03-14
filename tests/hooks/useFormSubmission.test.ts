// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	useFormSubmission,
	useFormSubmissionWithData,
} from "@/hooks/useFormSubmission";

describe("useFormSubmission", () => {
	it("initializes with no error and not submitting", () => {
		const submitFn = vi.fn();
		const { result } = renderHook(() => useFormSubmission(submitFn));
		expect(result.current.error).toBe(null);
		expect(result.current.isSubmitting).toBe(false);
	});

	it("submits successfully and calls onSuccess", async () => {
		const submitFn = vi.fn().mockResolvedValue(undefined);
		const onSuccess = vi.fn();
		const { result } = renderHook(() =>
			useFormSubmission(submitFn, { onSuccess })
		);
		await act(async () => {
			await result.current.handleSubmit({ name: "test" });
		});
		expect(submitFn).toHaveBeenCalledWith({ name: "test" });
		expect(onSuccess).toHaveBeenCalled();
		expect(result.current.error).toBe(null);
	});

	it("sets error on validation failure", async () => {
		expect.hasAssertions();
		const submitFn = vi.fn();
		const validate = vi.fn().mockReturnValue("invalid");
		const { result } = renderHook(() =>
			useFormSubmission(submitFn, { validate })
		);
		await act(async () => {
			try {
				await result.current.handleSubmit({});
			} catch {
				// expected
			}
		});
		expect(result.current.error).toBe("invalid");
		expect(submitFn).not.toHaveBeenCalled();
	});

	it("sets error on submit failure", async () => {
		expect.hasAssertions();
		const submitFn = vi.fn().mockRejectedValue(new Error("network error"));
		const { result } = renderHook(() =>
			useFormSubmission(submitFn, { errorMessage: "Submit failed" })
		);
		await act(async () => {
			try {
				await result.current.handleSubmit({});
			} catch {
				// expected
			}
		});
		expect(result.current.error).toBe("network error");
	});

	it("reset clears error and resets async state", async () => {
		expect.hasAssertions();
		const submitFn = vi.fn().mockRejectedValue(new Error("err"));
		const { result } = renderHook(() => useFormSubmission(submitFn));
		await act(async () => {
			try {
				await result.current.handleSubmit({});
			} catch {
				// expected
			}
		});
		expect(result.current.error).toBe("err");
		act(() => result.current.reset());
		expect(result.current.error).toBe(null);
	});

	it("setError allows manual error update", () => {
		const submitFn = vi.fn();
		const { result } = renderHook(() => useFormSubmission(submitFn));
		act(() => result.current.setError("manual"));
		expect(result.current.error).toBe("manual");
	});
});

describe("useFormSubmissionWithData", () => {
	it("returns data from submit", async () => {
		const submitFn = vi.fn().mockResolvedValue({ id: "123" });
		const { result } = renderHook(() => useFormSubmissionWithData(submitFn));
		await act(async () => {
			await result.current.handleSubmit({ name: "test" });
		});
		expect(result.current.data).toEqual({ id: "123" });
	});

	it("validates before submit", async () => {
		expect.hasAssertions();
		const submitFn = vi.fn();
		const validate = vi.fn().mockReturnValue("bad data");
		const { result } = renderHook(() =>
			useFormSubmissionWithData(submitFn, { validate })
		);
		await act(async () => {
			try {
				await result.current.handleSubmit({});
			} catch {
				// expected
			}
		});
		expect(result.current.error).toBe("bad data");
		expect(submitFn).not.toHaveBeenCalled();
	});

	it("calls onSuccess with returned data", async () => {
		const submitFn = vi.fn().mockResolvedValue({ id: "new-id" });
		const onSuccess = vi.fn();
		const { result } = renderHook(() =>
			useFormSubmissionWithData(submitFn, { onSuccess })
		);
		await act(async () => {
			await result.current.handleSubmit({ name: "test" });
		});
		expect(onSuccess).toHaveBeenCalledWith({ id: "new-id" });
	});
});
