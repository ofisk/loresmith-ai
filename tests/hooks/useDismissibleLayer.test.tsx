// @vitest-environment jsdom
import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDismissibleLayer } from "@/hooks/useDismissibleLayer";

describe("useDismissibleLayer", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls onClose when Escape is pressed while open", () => {
		const onClose = vi.fn();
		renderHook(() =>
			useDismissibleLayer({ open: true, onClose, enabled: true })
		);

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("does not call onClose when open is false", () => {
		const onClose = vi.fn();
		renderHook(() =>
			useDismissibleLayer({ open: false, onClose, enabled: true })
		);

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("does not call onClose when enabled is false", () => {
		const onClose = vi.fn();
		renderHook(() =>
			useDismissibleLayer({ open: true, onClose, enabled: false })
		);

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("ignores non-Escape keys", () => {
		const onClose = vi.fn();
		renderHook(() =>
			useDismissibleLayer({ open: true, onClose, enabled: true })
		);

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
			);
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("removes listener on unmount", () => {
		const onClose = vi.fn();
		const { unmount } = renderHook(() =>
			useDismissibleLayer({ open: true, onClose, enabled: true })
		);

		unmount();

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("calls onClose when Escape is pressed on a focused child whose ancestor stops propagation (modal pattern)", () => {
		const onClose = vi.fn();

		function Harness() {
			useDismissibleLayer({ open: true, onClose, enabled: true });
			return (
				// biome-ignore lint/a11y/noStaticElementInteractions: mirrors Modal dialog shell (keydown stopPropagation)
				<div onKeyDown={(e) => e.stopPropagation()}>
					<input type="text" data-testid="inner-field" />
				</div>
			);
		}

		render(<Harness />);
		const field = screen.getByTestId("inner-field");
		field.focus();

		fireEvent.keyDown(field, { key: "Escape" });

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
