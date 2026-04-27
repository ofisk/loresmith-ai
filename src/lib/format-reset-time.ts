/**
 * Human-readable reset time for rate-limit / quota UI (shared modal + indicator).
 */
export function formatRateLimitResetTime(iso: string): string {
	try {
		const d = new Date(iso.replace(" ", "T"));
		return d.toLocaleString(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}
