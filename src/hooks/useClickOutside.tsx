import { useEffect, useRef } from "react";

const useClickOutside = (callback: () => void) => {
	const ref = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			// Only trigger when the ref's element is in the document (e.g. modal is open).
			// Avoids closing on the same click that opened (ref can be stale/detached).
			if (
				ref.current &&
				document.contains(ref.current) &&
				!ref.current.contains(event.target as Node)
			) {
				callback();
			}
		};

		document.addEventListener("click", handleClick);

		return () => {
			document.removeEventListener("click", handleClick);
		};
	}, [callback]);

	return ref;
};

export default useClickOutside;
