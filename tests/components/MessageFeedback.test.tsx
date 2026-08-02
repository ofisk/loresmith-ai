// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageFeedback } from "@/components/chat/MessageFeedback";

describe("MessageFeedback", () => {
	it("toggles the thumbs-up button as pressed, and clears it when clicked again", () => {
		render(<MessageFeedback messageId="msg-1" />);

		const up = screen.getByRole("button", { name: "Good response" });
		expect(up.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(up);
		expect(up.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(up);
		expect(up.getAttribute("aria-pressed")).toBe("false");
	});

	it("selecting thumbs-down clears a previously selected thumbs-up", () => {
		render(<MessageFeedback messageId="msg-1" />);

		const up = screen.getByRole("button", { name: "Good response" });
		const down = screen.getByRole("button", { name: "Bad response" });

		fireEvent.click(up);
		expect(up.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(down);
		expect(down.getAttribute("aria-pressed")).toBe("true");
		expect(up.getAttribute("aria-pressed")).toBe("false");
	});

	it("does not render a regenerate button when onRegenerate is not provided", () => {
		render(<MessageFeedback messageId="msg-1" />);

		expect(
			screen.queryByRole("button", { name: "Regenerate response" })
		).not.toBeInTheDocument();
	});

	it("calls onRegenerate with the message id when the regenerate button is clicked", () => {
		const onRegenerate = vi.fn();
		render(<MessageFeedback messageId="msg-1" onRegenerate={onRegenerate} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Regenerate response" })
		);

		expect(onRegenerate).toHaveBeenCalledWith("msg-1");
	});
});
