// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ActionQueueProvider } from "@/contexts/ActionQueueContext";
import { useActionQueueRetry } from "@/hooks/useActionQueueRetry";

describe("useActionQueueRetry", () => {
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<ActionQueueProvider>{children}</ActionQueueProvider>
	);

	it("mounts and unmounts without error when queue is empty", () => {
		const addFileToCampaigns = vi.fn();
		const getJwt = vi.fn().mockReturnValue("jwt");
		const notify = vi.fn();

		const { unmount } = renderHook(
			() => useActionQueueRetry({ addFileToCampaigns }, getJwt, notify),
			{ wrapper }
		);

		expect(addFileToCampaigns).not.toHaveBeenCalled();
		unmount();
	});
});
