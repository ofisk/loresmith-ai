import { useEffect, useState, useId } from "react";
import type {
  SessionDigestWithData,
  SessionDigestData,
  SessionDigestStateChanges,
} from "@/types/session-digest";
import { validateSessionDigestData } from "@/types/session-digest";
import { FormField } from "@/components/input/FormField";
import { ArrayInput } from "@/components/input/ArrayInput";
import { FormButton } from "@/components/button/FormButton";
import { useSessionDigests } from "@/hooks/useSessionDigests";

interface SessionDigestFormProps {
  campaignId: string;
  digest?: SessionDigestWithData | null;
  onSave?: () => void;
  onCancel?: () => void;
  suggestedSessionNumber?: number;
  initialDigestData?: SessionDigestData | null;
}

const emptyDigestData: SessionDigestData = {
  last_session_recap: {
    key_events: [],
    state_changes: {
      factions: [],
      locations: [],
      npcs: [],
    },
    open_threads: [],
  },
  next_session_plan: {
    objectives_dm: [],
    probable_player_goals: [],
    beats: [],
    if_then_branches: [],
  },
  npcs_to_run: [],
  locations_in_focus: [],
  encounter_seeds: [],
  clues_and_revelations: [],
  treasure_and_rewards: [],
  todo_checklist: [],
};

export function SessionDigestForm({
  campaignId,
  digest,
  onSave,
  onCancel,
  suggestedSessionNumber,
  initialDigestData,
}: SessionDigestFormProps) {
  const [sessionNumber, setSessionNumber] = useState<number>(
    digest?.sessionNumber || suggestedSessionNumber || 1
  );
  const [sessionDate, setSessionDate] = useState<string>(
    digest?.sessionDate || ""
  );
  const [digestData, setDigestData] = useState<SessionDigestData>(
    digest?.digestData || initialDigestData || emptyDigestData
  );
  const [error, setError] = useState<string | null>(null);

  const { createSessionDigest, updateSessionDigest } = useSessionDigests();

  const sessionNumberId = useId();
  const sessionDateId = useId();

  useEffect(() => {
    if (digest) {
      setSessionNumber(digest.sessionNumber);
      setSessionDate(digest.sessionDate || "");
      setDigestData(digest.digestData);
    } else if (initialDigestData) {
      setDigestData(initialDigestData);
      if (suggestedSessionNumber) {
        setSessionNumber(suggestedSessionNumber);
      }
    } else if (suggestedSessionNumber) {
      setSessionNumber(suggestedSessionNumber);
    }
  }, [digest, suggestedSessionNumber, initialDigestData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateSessionDigestData(digestData)) {
      setError("Invalid digest data structure");
      return;
    }

    try {
      if (digest) {
        await updateSessionDigest.execute(campaignId, digest.id, {
          sessionDate: sessionDate || null,
          digestData,
        });
      } else {
        await createSessionDigest.execute(campaignId, {
          sessionNumber,
          sessionDate: sessionDate || null,
          digestData,
        });
      }
      onSave?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save session digest"
      );
    }
  };

  const updateStateChanges = (updates: Partial<SessionDigestStateChanges>) => {
    setDigestData((prev) => ({
      ...prev,
      last_session_recap: {
        ...prev.last_session_recap,
        state_changes: {
          ...prev.last_session_recap.state_changes,
          ...updates,
        },
      },
    }));
  };

  const isLoading = createSessionDigest.loading || updateSessionDigest.loading;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Session Metadata */}
      <div className="space-y-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Session Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            id={sessionNumberId}
            label="Session Number"
            type="number"
            value={sessionNumber.toString()}
            onValueChange={(value) => {
              const num = parseInt(value, 10);
              if (!Number.isNaN(num)) {
                setSessionNumber(num);
              }
            }}
            disabled={!!digest}
            placeholder="Session number"
          />
          <FormField
            id={sessionDateId}
            label="Session Date"
            type="date"
            value={sessionDate}
            onValueChange={setSessionDate}
            placeholder="Session date"
          />
        </div>
      </div>

      {/* Last Session Recap */}
      <div className="space-y-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Last Session Recap
        </h3>
        <ArrayInput
          label="Key Events"
          values={digestData.last_session_recap.key_events}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              last_session_recap: {
                ...prev.last_session_recap,
                key_events: values,
              },
            }));
          }}
          placeholder="Add key event..."
        />
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            State Changes
          </h4>
          <ArrayInput
            label="Factions"
            values={digestData.last_session_recap.state_changes.factions}
            onChange={(values) => updateStateChanges({ factions: values })}
            placeholder="Add faction..."
          />
          <ArrayInput
            label="Locations"
            values={digestData.last_session_recap.state_changes.locations}
            onChange={(values) => updateStateChanges({ locations: values })}
            placeholder="Add location..."
          />
          <ArrayInput
            label="NPCs"
            values={digestData.last_session_recap.state_changes.npcs}
            onChange={(values) => updateStateChanges({ npcs: values })}
            placeholder="Add NPC..."
          />
        </div>
        <ArrayInput
          label="Open Threads"
          values={digestData.last_session_recap.open_threads}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              last_session_recap: {
                ...prev.last_session_recap,
                open_threads: values,
              },
            }));
          }}
          placeholder="Add open thread..."
        />
      </div>

      {/* Next Session Plan */}
      <div className="space-y-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Next Session Plan
        </h3>
        <ArrayInput
          label="DM Objectives"
          values={digestData.next_session_plan.objectives_dm}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              next_session_plan: {
                ...prev.next_session_plan,
                objectives_dm: values,
              },
            }));
          }}
          placeholder="Add DM objective..."
        />
        <ArrayInput
          label="Probable Player Goals"
          values={digestData.next_session_plan.probable_player_goals}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              next_session_plan: {
                ...prev.next_session_plan,
                probable_player_goals: values,
              },
            }));
          }}
          placeholder="Add player goal..."
        />
        <ArrayInput
          label="Beats"
          values={digestData.next_session_plan.beats}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              next_session_plan: {
                ...prev.next_session_plan,
                beats: values,
              },
            }));
          }}
          placeholder="Add beat..."
        />
        <ArrayInput
          label="If-Then Branches"
          values={digestData.next_session_plan.if_then_branches}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              next_session_plan: {
                ...prev.next_session_plan,
                if_then_branches: values,
              },
            }));
          }}
          placeholder="Add if-then branch..."
        />
      </div>

      {/* Additional Planning */}
      <div className="space-y-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Additional Planning
        </h3>
        <ArrayInput
          label="NPCs to Run"
          values={digestData.npcs_to_run}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              npcs_to_run: values,
            }));
          }}
          placeholder="Add NPC..."
        />
        <ArrayInput
          label="Locations in Focus"
          values={digestData.locations_in_focus}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              locations_in_focus: values,
            }));
          }}
          placeholder="Add location..."
        />
        <ArrayInput
          label="Encounter Seeds"
          values={digestData.encounter_seeds}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              encounter_seeds: values,
            }));
          }}
          placeholder="Add encounter seed..."
        />
        <ArrayInput
          label="Clues and Revelations"
          values={digestData.clues_and_revelations}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              clues_and_revelations: values,
            }));
          }}
          placeholder="Add clue or revelation..."
        />
        <ArrayInput
          label="Treasure and Rewards"
          values={digestData.treasure_and_rewards}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              treasure_and_rewards: values,
            }));
          }}
          placeholder="Add treasure or reward..."
        />
        <ArrayInput
          label="Todo Checklist"
          values={digestData.todo_checklist}
          onChange={(values) => {
            setDigestData((prev) => ({
              ...prev,
              todo_checklist: values,
            }));
          }}
          placeholder="Add todo item..."
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4">
        {onCancel && (
          <FormButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </FormButton>
        )}
        <FormButton type="submit" loading={isLoading}>
          {digest ? "Update Digest" : "Create Digest"}
        </FormButton>
      </div>
    </form>
  );
}
