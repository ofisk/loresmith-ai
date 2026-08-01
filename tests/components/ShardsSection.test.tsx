// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShardsSection } from "@/components/resource-side-panel/ShardsSection";
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

describe("ShardsSection", () => {
	const mockOnShardsProcessed = vi.fn();
	const mockGetJwt = vi.fn(() => "test-jwt");
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
	});

	it("renders the trigger row with a shard count badge", () => {
		render(
			<ShardsSection
				shards={mockShards}
				isLoading={false}
				onShardsProcessed={mockOnShardsProcessed}
				getJwt={mockGetJwt}
			/>
		);

		expect(screen.getByText("Shards")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("hides the count badge when there are no shards", () => {
		render(
			<ShardsSection
				shards={[]}
				isLoading={false}
				onShardsProcessed={mockOnShardsProcessed}
				getJwt={mockGetJwt}
			/>
		);

		expect(screen.queryByText("0")).not.toBeInTheDocument();
	});

	it("opens the modal with the shard content when clicked", () => {
		render(
			<ShardsSection
				shards={mockShards}
				isLoading={false}
				onShardsProcessed={mockOnShardsProcessed}
				getJwt={mockGetJwt}
				onRefresh={mockOnRefresh}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: /Shards/ }));

		expect(screen.getByTestId("unified-shard-manager")).toBeInTheDocument();
		expect(screen.getByText("Test shard content 1")).toBeInTheDocument();
		expect(screen.getByText("Test shard content 2")).toBeInTheDocument();
		expect(screen.getByText("Pending shards (2 total)")).toBeInTheDocument();
	});

	it("calls onRefresh when the refresh button is clicked", () => {
		render(
			<ShardsSection
				shards={mockShards}
				isLoading={false}
				onShardsProcessed={mockOnShardsProcessed}
				getJwt={mockGetJwt}
				onRefresh={mockOnRefresh}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: /Shards/ }));
		fireEvent.click(screen.getByRole("button", { name: "Refresh shards" }));

		expect(mockOnRefresh).toHaveBeenCalledTimes(1);
	});

	it("closes the modal when Escape is pressed", () => {
		render(
			<ShardsSection
				shards={mockShards}
				isLoading={false}
				onShardsProcessed={mockOnShardsProcessed}
				getJwt={mockGetJwt}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: /Shards/ }));
		expect(screen.getByTestId("unified-shard-manager")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });

		expect(
			screen.queryByTestId("unified-shard-manager")
		).not.toBeInTheDocument();
	});
});
