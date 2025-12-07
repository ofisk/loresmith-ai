import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionDigestList } from "@/components/session/SessionDigestList";
import type { SessionDigestWithData } from "@/types/session-digest";

describe("SessionDigestList", () => {
  const mockDigest: SessionDigestWithData = {
    id: "digest-1",
    campaignId: "campaign-1",
    sessionNumber: 1,
    sessionDate: "2024-01-01",
    digestData: {
      last_session_recap: {
        key_events: ["Event 1", "Event 2"],
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
    },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  it("should render loading state", () => {
    render(<SessionDigestList digests={[]} loading={true} />);
    expect(screen.getByText("Loading digests...")).toBeInTheDocument();
  });

  it("should render error state", () => {
    render(
      <SessionDigestList digests={[]} error="Test error" loading={false} />
    );
    expect(screen.getByText("Error loading digests")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("should render empty state", () => {
    render(<SessionDigestList digests={[]} loading={false} />);
    expect(screen.getByText("No session digests yet")).toBeInTheDocument();
  });

  it("should render list of digests", () => {
    const mockOnEdit = vi.fn();
    const mockOnDelete = vi.fn();

    render(
      <SessionDigestList
        digests={[mockDigest]}
        loading={false}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("Session 1")).toBeInTheDocument();
  });
});
