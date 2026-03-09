import { useEffect, useRef } from "react";

const useClickOutside = (callback: () => void) => {
	const ref = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const handleMouseDown = (event: MouseEvent) => {
			// Use mousedown (not click) so we don't close on the same interaction that opened.
			// Event order: mousedown -> mouseup -> click. Opening happens on button's onClick (click).
			// By mousedown, the modal isn't open yet; by click, it is and we'd incorrectly close.
			if (
				ref.current &&
				document.contains(ref.current) &&
				!ref.current.contains(event.target as Node)
			) {
				callback();
			}
		};

		document.addEventListener("mousedown", handleMouseDown);

		return () => {
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [callback]);

	return ref;
};

export default useClickOutside;
