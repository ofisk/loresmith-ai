// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/notifications/NotificationBell";

describe("NotificationBell", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("closes the panel when Escape is pressed", () => {
		render(
			<NotificationBell
				notifications={[]}
				onDismiss={vi.fn()}
				onDismissAll={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
		expect(screen.getByText("No notifications")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });

		expect(screen.queryByText("No notifications")).not.toBeInTheDocument();
	});
});
