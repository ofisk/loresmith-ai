import { useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";

export interface RetryLimitStatusEntry {
	canRetry: boolean;
	reason?: string;
}

export function useRetryLimitStatus(fileKeys: string[] | null): {
	status: Record<string, RetryLimitStatusEntry>;
	loading: boolean;
} {
	const [status, setStatus] = useState<Record<string, RetryLimitStatusEntry>>(
		{}
	);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!fileKeys || fileKeys.length === 0) {
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
				const uniqueKeys = [...new Set(fileKeys)].filter(Boolean);
				const query = new URLSearchParams({
					fileKeys: uniqueKeys.join(","),
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
	}, [fileKeys]);

	return { status, loading };
}
