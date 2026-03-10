// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { UploadQueueProvider } from "@/contexts/UploadQueueContext";
import { useUploadQueueRetry } from "@/hooks/useUploadQueueRetry";

describe("useUploadQueueRetry", () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<UploadQueueProvider>{children}</UploadQueueProvider>
	);

	it("mounts and unmounts without error when queue is empty", () => {
		const handleUpload = vi.fn();

		const { unmount } = renderHook(() => useUploadQueueRetry(handleUpload), {
			wrapper,
		});

		expect(handleUpload).not.toHaveBeenCalled();
		unmount();
	});
});
