import { useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";

export interface RetryLimitStatusEntry {
	canRetry: boolean;
	reason?: string;
}

/** Stable serialization of file keys so we only refetch when the set of keys actually changes. */
function fileKeysStableKey(fileKeys: string[] | null): string | null {
	if (!fileKeys || fileKeys.length === 0) return null;
	const unique = [...new Set(fileKeys)].filter(Boolean).sort();
	return unique.length > 0 ? unique.join(",") : null;
}

export function useRetryLimitStatus(fileKeys: string[] | null): {
	status: Record<string, RetryLimitStatusEntry>;
	loading: boolean;
} {
	const [status, setStatus] = useState<Record<string, RetryLimitStatusEntry>>(
		{}
	);
	const [loading, setLoading] = useState(false);

	// Only refetch when the set of keys changes, not on every render (array reference changes).
	const stableKey = fileKeysStableKey(fileKeys);

	useEffect(() => {
		if (!stableKey) {
			setStatus({});
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);

		async function fetchStatus() {
			const jwt = localStorage.getItem(JWT_STORAGE_KEY);
			if (!jwt) {
				setLoading(false);
				return;
			}

			try {
				const query = new URLSearchParams({
					fileKeys: stableKey as string,
				});
				const url = `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.RETRY_LIMIT_STATUS)}?${query}`;
				const res = await fetch(url, {
					headers: { Authorization: `Bearer ${jwt}` },
				});
				if (cancelled) return;
				if (!res.ok) {
					setStatus({});
					return;
				}
				const json = (await res.json()) as {
					status: Record<string, { canRetry: boolean; reason?: string }>;
				};
				setStatus(json.status ?? {});
			} catch {
				if (!cancelled) setStatus({});
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchStatus();
		return () => {
			cancelled = true;
		};
	}, [stableKey]);

	return { status, loading };
}
