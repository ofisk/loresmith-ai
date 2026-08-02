// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/button/Button";
import { TooltipProvider } from "@/providers/TooltipProvider";

// Mock window.matchMedia for Tooltip component
beforeEach(() => {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
});

describe("Button", () => {
	it("renders its children as the label", () => {
		render(<Button>Add to campaign</Button>);

		expect(
			screen.getByRole("button", { name: "Add to campaign" })
		).toBeDefined();
	});

	// Regression: `title` used to be a content slot on ButtonProps, so passing it
	// painted the hover text inside the button on top of the label.
	it("passes `title` through as the native attribute, not as button content", () => {
		const hint = "This file is still processing.";
		render(<Button title={hint}>Add to campaign</Button>);

		const button = screen.getByRole("button", { name: "Add to campaign" });
		expect(button.getAttribute("title")).toBe(hint);
		expect(button.textContent).toBe("Add to campaign");
	});

	it("renders hover text supplied via `tooltip` outside the button element", () => {
		render(
			<TooltipProvider>
				<Button tooltip="Queued until processing finishes">
					Add to campaign
				</Button>
			</TooltipProvider>
		);

		const button = screen.getByRole("button", { name: "Add to campaign" });
		expect(button.textContent).toBe("Add to campaign");
	});
});
