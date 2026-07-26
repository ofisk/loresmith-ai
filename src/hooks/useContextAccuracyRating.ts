import { useCallback, useState } from "react";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";

export type ContextAccuracyVerdict = "accurate" | "inaccurate";

/** Accuracy is recorded on a 0-1 scale; a thumb is the extreme of that range. */
const VERDICT_ACCURACY: Record<ContextAccuracyVerdict, number> = {
	accurate: 1,
	inaccurate: 0,
};

/**
 * Records whether the retrieved context behind a response was on target.
 *
 * The rating is only meaningful when the rater can see the sources, which is
 * why this is wired to the sources panel rather than to the message as a whole.
 */
export function useContextAccuracyRating(options: {
	campaignId?: string | null;
	queryId?: string;
}) {
	const { campaignId, queryId } = options;
	const { makeRequest } = useAuthenticatedRequest();
	const [verdict, setVerdict] = useState<ContextAccuracyVerdict | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const canRate = Boolean(campaignId && queryId);

	const rate = useCallback(
		async (next: ContextAccuracyVerdict) => {
			if (!campaignId || !queryId || submitting) return;
			// Optimistic: the rating is advisory telemetry, not user data they
			// need to see confirmed.
			setVerdict(next);
			setSubmitting(true);
			try {
				await makeRequest(
					API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.TELEMETRY.CONTEXT_ACCURACY),
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							campaignId,
							queryId,
							accuracy: VERDICT_ACCURACY[next],
						}),
					}
				);
			} catch {
				setVerdict(null);
			} finally {
				setSubmitting(false);
			}
		},
		[campaignId, queryId, submitting, makeRequest]
	);

	return { canRate, verdict, submitting, rate };
}
