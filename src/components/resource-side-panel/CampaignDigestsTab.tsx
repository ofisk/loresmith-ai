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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Session digests
        </h3>
        <div className="flex gap-2">
          <FormButton onClick={onBulkImport} variant="secondary">
            Bulk import
          </FormButton>
          <FormButton onClick={onCreate} icon={<Plus size={16} />}>
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
