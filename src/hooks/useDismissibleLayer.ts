import { useEffect } from "react";

export type UseDismissibleLayerOptions = {
	/** When true, Escape will call onClose */
	open: boolean;
	onClose: () => void;
	/** If false, no listener is attached (e.g. blocking flows) */
	enabled?: boolean;
};

/**
 * Registers a document-level keydown listener so Escape dismisses the layer.
 * Uses **capture** so Escape still runs when a child calls `stopPropagation()`
 * (e.g. `Modal`'s dialog wrapper stops keydown bubble to avoid leaking to the app).
 * Use for menus, portaled panels, drawers, and any overlay that is not `Modal`.
 * `Modal` also uses this when `allowEscape` is true.
 */
export function useDismissibleLayer({
	open,
	onClose,
	enabled = true,
}: UseDismissibleLayerOptions) {
	useEffect(() => {
		if (!open || !enabled) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			onClose();
		};

		document.addEventListener("keydown", handleKeyDown, { capture: true });
		return () =>
			document.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [open, onClose, enabled]);
}
