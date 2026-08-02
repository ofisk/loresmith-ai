import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "@/app-constants";
import { AuthService } from "@/services/core/auth-service";
import type {
	Experiment,
	ExperimentResults,
	UpsertExperimentInput,
} from "@/types/experiments";

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
	const jwt = AuthService.getStoredJwt();
	if (!jwt) {
		throw new Error("Authentication required");
	}

	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${jwt}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	if (!response.ok) {
		if (response.status === 403) {
			throw new Error("Admin access required");
		}
		const body = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? `Request failed: ${response.status}`);
	}

	return (await response.json()) as T;
}

/**
 * Admin CRUD over the `experiments` table.
 *
 * Every mutation re-lists rather than patching local state, because the server
 * normalizes what it stores (clamped rollout percentages, `updated_by`,
 * `updated_at`) and an optimistic local copy would show numbers the database
 * does not actually hold.
 */
export function useAdminExperiments() {
	const [experiments, setExperiments] = useState<Experiment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await adminFetch<{ experiments: Experiment[] }>(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.LIST)
			);
			setExperiments(data.experiments ?? []);
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Unknown error"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const createExperiment = useCallback(
		async (input: UpsertExperimentInput) => {
			await adminFetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.CREATE),
				{ method: "POST", body: JSON.stringify(input) }
			);
			await refresh();
		},
		[refresh]
	);

	const updateExperiment = useCallback(
		async (key: string, patch: Partial<UpsertExperimentInput>) => {
			await adminFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.UPDATE(encodeURIComponent(key))
				),
				{ method: "PATCH", body: JSON.stringify(patch) }
			);
			await refresh();
		},
		[refresh]
	);

	const deleteExperiment = useCallback(
		async (key: string) => {
			await adminFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.DELETE(encodeURIComponent(key))
				),
				{ method: "DELETE" }
			);
			await refresh();
		},
		[refresh]
	);

	return {
		experiments,
		loading,
		error,
		refresh,
		createExperiment,
		updateExperiment,
		deleteExperiment,
	};
}

/**
 * Per-arm exposure counts for one experiment. Only fetched when a row is
 * expanded, so the list view stays a single query.
 */
export function useExperimentResults(key: string | null) {
	const [results, setResults] = useState<ExperimentResults | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!key) {
			setResults(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		adminFetch<ExperimentResults>(
			API_CONFIG.buildUrl(
				API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.RESULTS(encodeURIComponent(key))
			)
		)
			.then((data) => {
				if (!cancelled) setResults(data);
			})
			.catch((err) => {
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error("Unknown error"));
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [key]);

	return { results, loading, error };
}
