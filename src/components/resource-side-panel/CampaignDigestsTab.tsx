import { Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button/Button";
import { PlayerRecapReviewModal } from "@/components/session/PlayerRecapReviewModal";
import { SessionDigestList } from "@/components/session/SessionDigestList";
import { Toggle } from "@/components/toggle/Toggle";
import { usePlayerRecaps } from "@/hooks/usePlayerRecaps";
import type { SessionDigestWithData } from "@/types/session-digest";

interface CampaignDigestsTabProps {
	campaignId: string;
	digests: SessionDigestWithData[];
	loading: boolean;
	error: string | null;
	canManageDigests: boolean;
	onEdit: (digest: SessionDigestWithData) => void;
	onDelete: (digest: SessionDigestWithData) => Promise<void>;
	onCreate: () => void;
	onBulkImport: () => void;
}

/**
 * Session digests tab: list, create, bulk import, and player recap emails.
 *
 * Recaps are opt-in per campaign; the send action only appears once the GM has
 * turned them on, so no campaign gains an outbound email path by upgrading.
 */
export function CampaignDigestsTab({
	campaignId,
	digests,
	loading,
	error,
	canManageDigests,
	onEdit,
	onDelete,
	onCreate,
	onBulkImport,
}: CampaignDigestsTabProps) {
	const { settings, fetchSettings, updateSettings } = usePlayerRecaps();
	const [recapDigest, setRecapDigest] = useState<SessionDigestWithData | null>(
		null
	);

	useEffect(() => {
		if (canManageDigests) {
			void fetchSettings(campaignId);
		}
	}, [campaignId, canManageDigests, fetchSettings]);

	const recapsEnabled = settings?.enabled ?? false;

	return (
		<div className="space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
				<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
					Session digests
				</h3>
				{canManageDigests && (
					<div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
						<Button
							appearance="form"
							onClick={onBulkImport}
							variant="secondary"
							className="w-full sm:w-auto"
						>
							Bulk import
						</Button>
						<Button
							appearance="form"
							onClick={onCreate}
							icon={<Plus size={16} />}
							className="w-full sm:w-auto"
						>
							Create digest
						</Button>
					</div>
				)}
			</div>

			{canManageDigests && (
				<div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
					<div>
						<p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
							Player recap emails
						</p>
						<p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
							Send a spoiler-filtered recap to your players after a session. You
							review and edit every email before it goes out.
						</p>
					</div>
					<Toggle
						toggled={recapsEnabled}
						onClick={() => void updateSettings(campaignId, !recapsEnabled)}
					/>
				</div>
			)}

			<SessionDigestList
				digests={digests}
				loading={loading}
				error={error}
				onEdit={canManageDigests ? onEdit : undefined}
				onDelete={canManageDigests ? onDelete : undefined}
				onSendRecap={
					canManageDigests && recapsEnabled ? setRecapDigest : undefined
				}
			/>

			<PlayerRecapReviewModal
				isOpen={recapDigest !== null}
				onClose={() => setRecapDigest(null)}
				campaignId={campaignId}
				digest={recapDigest}
			/>
		</div>
	);
}
