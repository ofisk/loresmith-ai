import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { API_CONFIG } from "@/app-constants";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import {
	clearRuntimeAssignments,
	setRuntimeAssignments,
} from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { AuthService } from "@/services/core/auth-service";
import type {
	ExperimentAssignmentsResponse,
	FlagMap,
	VariantMap,
} from "@/types/experiments";

const log = logger.scope("[ExperimentProvider]");

export interface ExperimentContextValue {
	assignments: VariantMap;
	flags: FlagMap;
	/** False until the first fetch settles, either way. */
	loaded: boolean;
	/** True when the fetch failed and reads are falling back to build-time flags. */
	usingFallback: boolean;
	refresh: () => Promise<void>;
}

/**
 * `undefined` rather than a default value, so `useFeatureFlag` can tell "no
 * provider mounted" (a unit test, a Storybook story) from "provider mounted but
 * still loading" and fall back to the module-level flags in the first case.
 */
const ExperimentContext = createContext<ExperimentContextValue | undefined>(
	undefined
);

export function useExperimentContext(): ExperimentContextValue | undefined {
	return useContext(ExperimentContext);
}

/**
 * Fetches the user's resolved variant map once per session and seeds both the
 * React context (so components re-render when it lands) and the module-level
 * cache in `@/lib/feature-flags` (so plain-TS `isFeatureEnabled` callers, which
 * cannot read context, see the same answer).
 *
 * On failure it deliberately leaves the runtime layer empty rather than writing
 * an all-false map: reads then fall through to the build-time `VITE_FEATURES`
 * values. A network blip must not silently disable every feature at once.
 */
export function ExperimentProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [assignments, setAssignments] = useState<VariantMap>({});
	const [flags, setFlags] = useState<FlagMap>({});
	const [loaded, setLoaded] = useState(false);
	const [usingFallback, setUsingFallback] = useState(false);

	const refresh = useCallback(async () => {
		const jwt = AuthService.getStoredJwt();
		if (!jwt || AuthService.isJwtExpired(jwt)) {
			// Bucketing needs a username, and logged-out surfaces have none. Known
			// v1 limit: pre-auth pages cannot be experimented on.
			clearRuntimeAssignments();
			setAssignments({});
			setFlags({});
			setLoaded(true);
			return;
		}

		try {
			const response = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.EXPERIMENTS.ASSIGNMENTS),
				{
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
				}
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch assignments: ${response.status}`);
			}

			const data = (await response.json()) as ExperimentAssignmentsResponse;
			const nextAssignments = data.assignments ?? {};
			const nextFlags = data.flags ?? {};

			setRuntimeAssignments(nextAssignments, nextFlags);
			setAssignments(nextAssignments);
			setFlags(nextFlags);
			setUsingFallback(false);
		} catch (error) {
			log.warn("Falling back to build-time feature flags", {
				error: error instanceof Error ? error.message : String(error),
			});
			clearRuntimeAssignments();
			setUsingFallback(true);
		} finally {
			setLoaded(true);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Login and logout both change who we are bucketing, so the map has to be
	// re-resolved rather than carried across the identity change.
	useEffect(() => {
		const handleJwtChanged = () => {
			void refresh();
		};
		window.addEventListener(
			APP_EVENT_TYPE.JWT_CHANGED,
			handleJwtChanged as EventListener
		);
		return () => {
			window.removeEventListener(
				APP_EVENT_TYPE.JWT_CHANGED,
				handleJwtChanged as EventListener
			);
		};
	}, [refresh]);

	const value = useMemo<ExperimentContextValue>(
		() => ({ assignments, flags, loaded, usingFallback, refresh }),
		[assignments, flags, loaded, usingFallback, refresh]
	);

	return (
		<ExperimentContext.Provider value={value}>
			{children}
		</ExperimentContext.Provider>
	);
}
