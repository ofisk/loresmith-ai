import { useCallback, useState } from "react";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import type { SpoilerFlag } from "@/lib/player-recap/player-safe-digest";
import { API_CONFIG } from "@/shared-config";
import type {
	CampaignRecapSettings,
	PlayerRecapDelivery,
	PlayerRecapEmail,
	PlayerRecapRecipient,
	PlayerRecapSendResult,
	PlayerSafeRecap,
} from "@/types/player-recap";

export interface PlayerRecapDraftState {
	recap: PlayerRecapEmail;
	safeRecap: PlayerSafeRecap | null;
	spoilerFlags: SpoilerFlag[];
	deliveries?: PlayerRecapDelivery[];
}

/**
 * Player recap email operations for the GM review flow.
 *
 * Deliberately has no "generate and send" convenience call: the only send path
 * requires a recap id that came back from a draft the GM has looked at.
 */
export function usePlayerRecaps() {
	const { makeRequestWithData } = useAuthenticatedRequest();

	const [settings, setSettings] = useState<CampaignRecapSettings | null>(null);
	const [recipients, setRecipients] = useState<PlayerRecapRecipient[]>([]);
	const [draft, setDraft] = useState<PlayerRecapDraftState | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = useCallback(
		async <T>(op: () => Promise<T>): Promise<T | null> => {
			setLoading(true);
			setError(null);
			try {
				return await op();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
				return null;
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	const fetchSettings = useCallback(
		(campaignId: string) =>
			run(async () => {
				const data = await makeRequestWithData<{
					settings: CampaignRecapSettings;
				}>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SETTINGS(campaignId)
					)
				);
				setSettings(data.settings);
				return data.settings;
			}),
		[makeRequestWithData, run]
	);

	const updateSettings = useCallback(
		(campaignId: string, enabled: boolean) =>
			run(async () => {
				const data = await makeRequestWithData<{
					settings: CampaignRecapSettings;
				}>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SETTINGS(campaignId)
					),
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ enabled }),
					}
				);
				setSettings(data.settings);
				return data.settings;
			}),
		[makeRequestWithData, run]
	);

	const fetchRecipients = useCallback(
		(campaignId: string) =>
			run(async () => {
				const data = await makeRequestWithData<{
					recipients: PlayerRecapRecipient[];
				}>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.RECIPIENTS(campaignId)
					)
				);
				setRecipients(data.recipients);
				return data.recipients;
			}),
		[makeRequestWithData, run]
	);

	const generateDraft = useCallback(
		(campaignId: string, digestId: string, nextSessionDate?: string | null) =>
			run(async () => {
				const data = await makeRequestWithData<PlayerRecapDraftState>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.GENERATE(
							campaignId,
							digestId
						)
					),
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ nextSessionDate: nextSessionDate ?? null }),
					}
				);
				setDraft(data);
				return data;
			}),
		[makeRequestWithData, run]
	);

	const saveDraft = useCallback(
		(
			campaignId: string,
			recapId: string,
			input: {
				subject?: string;
				bodyMarkdown?: string;
				nextSessionDate?: string | null;
			}
		) =>
			run(async () => {
				const data = await makeRequestWithData<{ recap: PlayerRecapEmail }>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.DETAILS(
							campaignId,
							recapId
						)
					),
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(input),
					}
				);
				setDraft((prev) => (prev ? { ...prev, recap: data.recap } : prev));
				return data.recap;
			}),
		[makeRequestWithData, run]
	);

	const sendRecap = useCallback(
		(campaignId: string, recapId: string) =>
			run(async () => {
				const data = await makeRequestWithData<PlayerRecapSendResult>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SEND(
							campaignId,
							recapId
						)
					),
					{ method: "POST" }
				);
				setDraft((prev) =>
					prev
						? { ...prev, recap: data.recap, deliveries: data.deliveries }
						: prev
				);
				return data;
			}),
		[makeRequestWithData, run]
	);

	return {
		settings,
		recipients,
		draft,
		loading,
		error,
		fetchSettings,
		updateSettings,
		fetchRecipients,
		generateDraft,
		saveDraft,
		sendRecap,
		clearDraft: () => setDraft(null),
		setError,
	};
}
