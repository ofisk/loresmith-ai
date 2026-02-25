import { Plus } from "@phosphor-icons/react";
import { FormButton } from "@/components/button/FormButton";
import { SessionDigestList } from "@/components/session/SessionDigestList";
import type { SessionDigestWithData } from "@/types/session-digest";

interface CampaignDigestsTabProps {
	digests: SessionDigestWithData[];
	loading: boolean;
	error: string | null;
	onEdit: (digest: SessionDigestWithData) => void;
	onDelete: (digest: SessionDigestWithData) => Promise<void>;
	onCreate: () => void;
	onBulkImport: () => void;
}

/**
 * Session digests tab: list, create, bulk import.
 */
export function CampaignDigestsTab({
	digests,
	loading,
	error,
	onEdit,
	onDelete,
	onCreate,
	onBulkImport,
}: CampaignDigestsTabProps) {
	return (
		<div className="space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
				<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
					Session digests
				</h3>
				<div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
					<FormButton
						onClick={onBulkImport}
						variant="secondary"
						className="w-full sm:w-auto"
					>
						Bulk import
					</FormButton>
					<FormButton
						onClick={onCreate}
						icon={<Plus size={16} />}
						className="w-full sm:w-auto"
					>
						Create digest
					</FormButton>
				</div>
			</div>
			<SessionDigestList
				digests={digests}
				loading={loading}
				error={error}
				onEdit={onEdit}
				onDelete={onDelete}
			/>
		</div>
	);
}
