// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUiHints } from "@/hooks/useUiHints";
import { APP_EVENT_TYPE } from "@/lib/app-events";

describe("useUiHints", () => {
	it("calls onUiHint when UI_HINT event is dispatched", () => {
		const onUiHint = vi.fn();
		renderHook(() => useUiHints({ onUiHint }));

		window.dispatchEvent(
			new CustomEvent(APP_EVENT_TYPE.UI_HINT, {
				detail: { type: "hint-type", data: { foo: "bar" } },
			})
		);

		expect(onUiHint).toHaveBeenCalledWith({
			type: "hint-type",
			data: { foo: "bar" },
		});
	});

	it("does not call onUiHint when type is missing", () => {
		const onUiHint = vi.fn();
		renderHook(() => useUiHints({ onUiHint }));

		window.dispatchEvent(
			new CustomEvent(APP_EVENT_TYPE.UI_HINT, {
				detail: { type: "" },
			})
		);

		expect(onUiHint).not.toHaveBeenCalled();
	});

	it("removes listener on unmount", () => {
		const onUiHint = vi.fn();
		const { unmount } = renderHook(() => useUiHints({ onUiHint }));
		unmount();

		window.dispatchEvent(
			new CustomEvent(APP_EVENT_TYPE.UI_HINT, {
				detail: { type: "after-unmount" },
			})
		);

		expect(onUiHint).not.toHaveBeenCalled();
	});
});
