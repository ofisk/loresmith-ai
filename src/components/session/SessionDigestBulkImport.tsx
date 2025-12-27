import { useState } from "react";
import { FormField } from "@/components/input/FormField";
import { FormButton } from "@/components/button/FormButton";
import type { SessionDigestData } from "@/types/session-digest";

interface SessionDigestBulkImportProps {
  onImport: (digestData: SessionDigestData) => void;
  onCancel?: () => void;
  className?: string;
}

export function SessionDigestBulkImport({
  onImport,
  onCancel,
  className = "",
}: SessionDigestBulkImportProps) {
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseNotesToDigest = (text: string): SessionDigestData => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const digestData: SessionDigestData = {
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

    let currentSection: string | null = null;
    let currentSubsection: string | null = null;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Detect section headers
      if (lowerLine.includes("key events") || lowerLine.includes("events")) {
        currentSection = "key_events";
        continue;
      }
      if (
        lowerLine.includes("state changes") ||
        lowerLine.includes("state change")
      ) {
        currentSection = "state_changes";
        continue;
      }
      if (
        lowerLine.includes("open threads") ||
        lowerLine.includes("threads") ||
        lowerLine.includes("loose ends")
      ) {
        currentSection = "open_threads";
        continue;
      }
      if (
        lowerLine.includes("objectives") ||
        lowerLine.includes("dm objectives") ||
        lowerLine.includes("goals")
      ) {
        currentSection = "objectives_dm";
        continue;
      }
      if (
        lowerLine.includes("player goals") ||
        lowerLine.includes("player objectives")
      ) {
        currentSection = "probable_player_goals";
        continue;
      }
      if (lowerLine.includes("beats")) {
        currentSection = "beats";
        continue;
      }
      if (lowerLine.includes("if then") || lowerLine.includes("branches")) {
        currentSection = "if_then_branches";
        continue;
      }
      if (lowerLine.includes("npcs to run") || lowerLine.includes("npcs")) {
        currentSection = "npcs_to_run";
        continue;
      }
      if (lowerLine.includes("locations")) {
        currentSection = "locations_in_focus";
        continue;
      }
      if (lowerLine.includes("encounter")) {
        currentSection = "encounter_seeds";
        continue;
      }
      if (lowerLine.includes("clue") || lowerLine.includes("revelation")) {
        currentSection = "clues_and_revelations";
        continue;
      }
      if (lowerLine.includes("treasure") || lowerLine.includes("reward")) {
        currentSection = "treasure_and_rewards";
        continue;
      }
      if (lowerLine.includes("todo") || lowerLine.includes("checklist")) {
        currentSection = "todo_checklist";
        continue;
      }

      // Detect subsections for state changes
      if (currentSection === "state_changes") {
        if (lowerLine.includes("faction")) {
          currentSubsection = "factions";
          continue;
        }
        if (lowerLine.includes("location")) {
          currentSubsection = "locations";
          continue;
        }
        if (lowerLine.includes("npc")) {
          currentSubsection = "npcs";
          continue;
        }
      }

      // Skip if it's still a header (starts with common header patterns)
      if (
        line.match(/^(section|chapter|part|###|##|#)/i) ||
        line.endsWith(":") ||
        line.match(/^[-*]\s*$/)
      ) {
        continue;
      }

      // Parse list items (bullets, dashes, numbers)
      const listItemMatch = line.match(/^[-*•]\s*(.+)$|^\d+[.)]\s*(.+)$/);
      const itemText = listItemMatch
        ? listItemMatch[1] || listItemMatch[2]
        : line;

      if (!itemText.trim()) continue;

      // Add to appropriate section
      if (currentSection === "key_events") {
        digestData.last_session_recap.key_events.push(itemText);
      } else if (currentSection === "open_threads") {
        digestData.last_session_recap.open_threads.push(itemText);
      } else if (currentSection === "state_changes") {
        if (currentSubsection === "factions") {
          digestData.last_session_recap.state_changes.factions.push(itemText);
        } else if (currentSubsection === "locations") {
          digestData.last_session_recap.state_changes.locations.push(itemText);
        } else if (currentSubsection === "npcs") {
          digestData.last_session_recap.state_changes.npcs.push(itemText);
        }
      } else if (currentSection === "objectives_dm") {
        digestData.next_session_plan.objectives_dm.push(itemText);
      } else if (currentSection === "probable_player_goals") {
        digestData.next_session_plan.probable_player_goals.push(itemText);
      } else if (currentSection === "beats") {
        digestData.next_session_plan.beats.push(itemText);
      } else if (currentSection === "if_then_branches") {
        digestData.next_session_plan.if_then_branches.push(itemText);
      } else if (currentSection === "npcs_to_run") {
        digestData.npcs_to_run.push(itemText);
      } else if (currentSection === "locations_in_focus") {
        digestData.locations_in_focus.push(itemText);
      } else if (currentSection === "encounter_seeds") {
        digestData.encounter_seeds.push(itemText);
      } else if (currentSection === "clues_and_revelations") {
        digestData.clues_and_revelations.push(itemText);
      } else if (currentSection === "treasure_and_rewards") {
        digestData.treasure_and_rewards.push(itemText);
      } else if (currentSection === "todo_checklist") {
        digestData.todo_checklist.push(itemText);
      } else {
        // Default: add to key events if no section is specified
        digestData.last_session_recap.key_events.push(itemText);
      }
    }

    return digestData;
  };

  const handleImport = () => {
    if (!notes.trim()) {
      setError("Please enter some notes to import");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const digestData = parseNotesToDigest(notes);
      onImport(digestData);
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to parse notes. Please check the format."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const notesId = "bulk-import-notes";

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Bulk Import from Notes
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Paste your session notes below. The importer will try to organize them
          into the appropriate sections based on keywords and structure.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <FormField
        id={notesId}
        label="Session notes"
        value={notes}
        onValueChange={setNotes}
        placeholder="Paste your session notes here...&#10;&#10;Key Events:&#10;- Event 1&#10;- Event 2&#10;&#10;Objectives:&#10;- Objective 1"
        multiline
        rows={12}
      />

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onCancel && (
          <FormButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </FormButton>
        )}
        <FormButton
          type="button"
          onClick={handleImport}
          loading={isProcessing}
          disabled={!notes.trim() || isProcessing}
        >
          {isProcessing ? "Processing..." : "Import Notes"}
        </FormButton>
      </div>
    </div>
  );
}
