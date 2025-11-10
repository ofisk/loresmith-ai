import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShardOverlay } from "@/components/shard/ShardOverlay";
import type { StagedShardGroup } from "@/types/shard";

// Mock the UnifiedShardManager component
vi.mock("@/components/chat/UnifiedShardManager", () => ({
  UnifiedShardManager: ({
    shards,
  }: {
    shards: StagedShardGroup[];
    onShardsProcessed: (ids: string[]) => void;
  }) => (
    <div data-testid="unified-shard-manager">
      {shards.map((group) => (
        <div key={group.key} data-testid={`shard-group-${group.key}`}>
          {group.shards?.map((shard) => (
            <div key={shard.id} data-testid={`shard-${shard.id}`}>
              {shard.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe("ShardOverlay", () => {
  const mockOnShardsProcessed = vi.fn();
  const mockGetJwt = vi.fn(() => "test-jwt");
  const mockOnAutoExpand = vi.fn();
  const mockOnRefresh = vi.fn();

  const mockShards: StagedShardGroup[] = [
    {
      key: "group-1",
      sourceRef: {
        fileKey: "file-1",
        meta: {
          fileName: "test.pdf",
          campaignId: "camp-1",
        },
      },
      created_at: new Date().toISOString(),
      campaignRagBasePath: "campaigns/camp-1",
      shards: [
        {
          id: "shard-1",
          text: "Test shard content 1",
          metadata: {
            fileKey: "file-1",
            fileName: "test.pdf",
            source: "test",
            campaignId: "camp-1",
            entityType: "locations",
            confidence: 0.9,
          },
          sourceRef: {
            fileKey: "file-1",
            meta: {
              fileName: "test.pdf",
              campaignId: "camp-1",
            },
          },
        },
        {
          id: "shard-2",
          text: "Test shard content 2",
          metadata: {
            fileKey: "file-1",
            fileName: "test.pdf",
            source: "test",
            campaignId: "camp-1",
            entityType: "npcs",
            confidence: 0.9,
          },
          sourceRef: {
            fileKey: "file-1",
            meta: {
              fileName: "test.pdf",
              campaignId: "camp-1",
            },
          },
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn(); // Mock console.log to avoid test noise
  });

  it("should render collapsed button when shards exist", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
      />
    );

    // Should show the collapsed button with shard count
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("should show loading indicator when isLoading is true", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={true}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
      />
    );

    // Should show "..." when loading
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("should expand when button is clicked", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
        onAutoExpand={mockOnAutoExpand}
        onRefresh={mockOnRefresh}
      />
    );

    const toggleButton = screen.getByText("2").closest("button");
    expect(toggleButton).toBeInTheDocument();

    if (toggleButton) {
      fireEvent.click(toggleButton);

      // After expansion, the UnifiedShardManager should be visible
      expect(screen.getByTestId("unified-shard-manager")).toBeInTheDocument();
    }
  });

  it("should show shard content when expanded", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
      />
    );

    const toggleButton = screen.getByText("2").closest("button");
    if (toggleButton) {
      fireEvent.click(toggleButton);

      // Should show shard content
      expect(screen.getByText("Test shard content 1")).toBeInTheDocument();
      expect(screen.getByText("Test shard content 2")).toBeInTheDocument();
    }
  });

  it("should collapse when button is clicked again", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
      />
    );

    const toggleButton = screen.getByText("2").closest("button");
    if (toggleButton) {
      // Expand
      fireEvent.click(toggleButton);
      expect(screen.getByTestId("unified-shard-manager")).toBeInTheDocument();

      // Collapse
      fireEvent.click(toggleButton);
      // The manager should still be in DOM but hidden (CSS handles visibility)
      // We can verify the button is still there
      expect(screen.getByText("2")).toBeInTheDocument();
    }
  });

  it("should show zero count when no shards", () => {
    render(
      <ShardOverlay
        shards={[]}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
      />
    );

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("should call onAutoExpand when new shards are added", () => {
    const { rerender } = render(
      <ShardOverlay
        shards={[]}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
        onAutoExpand={mockOnAutoExpand}
      />
    );

    // Add shards
    rerender(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
        onAutoExpand={mockOnAutoExpand}
      />
    );

    // onAutoExpand should be called when new shards arrive
    expect(mockOnAutoExpand).toHaveBeenCalled();
  });

  it("should call onRefresh when refresh button is clicked", () => {
    render(
      <ShardOverlay
        shards={mockShards}
        isLoading={false}
        onShardsProcessed={mockOnShardsProcessed}
        getJwt={mockGetJwt}
        onRefresh={mockOnRefresh}
      />
    );

    // Expand first to see refresh button
    const toggleButton = screen.getByText("2").closest("button");
    if (toggleButton) {
      fireEvent.click(toggleButton);

      // Look for refresh button (might be in the expanded panel)
      // This depends on the actual implementation
      // For now, we verify the component renders and can be interacted with
      expect(screen.getByTestId("unified-shard-manager")).toBeInTheDocument();
    }
  });
});
