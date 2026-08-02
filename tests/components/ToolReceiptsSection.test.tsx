// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolReceiptsSection } from "@/components/chat/ToolReceiptsSection";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import type { ToolReceipts } from "@/types/tool-receipt";

function receipts(overrides: Partial<ToolReceipts> = {}): ToolReceipts {
	return {
		calls: [
			{
				toolName: "searchCampaignContext",
				label: "Search campaign context",
				effect: "read",
				status: "ok",
				detail: "sea captain",
				outcome: "3 matches",
			},
			{
				toolName: "updateEntityMetadataTool",
				label: "Update entity metadata",
				effect: "write",
				status: "ok",
				outcome: "Entity updated",
				entities: [{ id: "e1", name: "Captain Vane" }],
			},
		],
		writeCount: 1,
		errorCount: 0,
		totalCallCount: 2,
		...overrides,
	};
}

describe("ToolReceiptsSection", () => {
	it("summarises the run without expanding", () => {
		render(<ToolReceiptsSection receipts={receipts()} />);

		expect(screen.getByText("2 actions")).toBeInTheDocument();
		expect(screen.getByText("1 change")).toBeInTheDocument();
		// Collapsed by default: the detail rows are not in the document yet.
		expect(screen.queryByText("3 matches")).not.toBeInTheDocument();
	});

	it("expands to show each call and what it returned", () => {
		render(<ToolReceiptsSection receipts={receipts()} />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));

		expect(screen.getByText("Search campaign context")).toBeInTheDocument();
		expect(screen.getByText("sea captain")).toBeInTheDocument();
		expect(screen.getByText("3 matches")).toBeInTheDocument();
		expect(screen.getByText("Entity updated")).toBeInTheDocument();
	});

	it("shows failures instead of hiding them", () => {
		render(
			<ToolReceiptsSection
				receipts={receipts({
					calls: [
						{
							toolName: "updateEntityWorldStateTool",
							label: "Update entity world state",
							effect: "write",
							status: "error",
							outcome: "Entity not found",
						},
					],
					writeCount: 1,
					errorCount: 1,
					totalCallCount: 1,
				})}
			/>
		);

		expect(screen.getByText("1 failed")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		expect(screen.getByText("Entity not found")).toBeInTheDocument();
	});

	it("says when a call ran more than once", () => {
		render(
			<ToolReceiptsSection
				receipts={receipts({
					calls: [
						{
							toolName: "listAllEntities",
							label: "List all entities",
							effect: "read",
							status: "ok",
							outcome: "4 entities",
							attempts: 3,
						},
					],
					writeCount: 0,
					errorCount: 0,
					totalCallCount: 3,
				})}
			/>
		);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		expect(screen.getByText("ran 3×")).toBeInTheDocument();
	});

	it("opens a touched entity in the graph UI", () => {
		const listener = vi.fn();
		window.addEventListener(APP_EVENT_TYPE.OPEN_SOURCE_ENTITY, listener);

		render(<ToolReceiptsSection receipts={receipts()} campaignId="camp-1" />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		fireEvent.click(screen.getByRole("button", { name: /Open Captain Vane/ }));

		expect(listener).toHaveBeenCalledTimes(1);
		const event = listener.mock.calls[0][0] as CustomEvent;
		expect(event.detail).toEqual({
			campaignId: "camp-1",
			entityId: "e1",
			entityName: "Captain Vane",
		});

		window.removeEventListener(APP_EVENT_TYPE.OPEN_SOURCE_ENTITY, listener);
	});

	it("does not print the entity name twice once it is a link", () => {
		const withDuplicate = receipts({
			calls: [
				{
					toolName: "updateEntityMetadataTool",
					label: "Update entity metadata",
					effect: "write",
					status: "ok",
					detail: "Captain Vane",
					outcome: "Entity updated",
					entities: [{ id: "e1", name: "Captain Vane" }],
				},
			],
			totalCallCount: 1,
		});

		render(
			<ToolReceiptsSection
				receipts={withDuplicate}
				campaignId="camp-1"
				collapsedByDefault={false}
			/>
		);
		expect(screen.getAllByText("Captain Vane")).toHaveLength(1);
	});

	it("keeps the detail text when there is no link to replace it", () => {
		const withDuplicate = receipts({
			calls: [
				{
					toolName: "updateEntityMetadataTool",
					label: "Update entity metadata",
					effect: "write",
					status: "ok",
					detail: "Captain Vane",
					outcome: "Entity updated",
					entities: [{ id: "e1", name: "Captain Vane" }],
				},
			],
			totalCallCount: 1,
		});

		render(
			<ToolReceiptsSection
				receipts={withDuplicate}
				collapsedByDefault={false}
			/>
		);
		expect(screen.getByText("Captain Vane")).toBeInTheDocument();
	});

	it("renders no entity link without a campaign to link into", () => {
		render(<ToolReceiptsSection receipts={receipts()} />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		expect(
			screen.queryByRole("button", { name: /Open Captain Vane/ })
		).not.toBeInTheDocument();
	});

	it("reports calls dropped by the per-message cap", () => {
		render(
			<ToolReceiptsSection
				receipts={receipts({ totalCallCount: 5 })}
				collapsedByDefault={false}
			/>
		);
		expect(screen.getByText("3 more calls not shown.")).toBeInTheDocument();
	});

	it("renders nothing when there are no calls", () => {
		const { container } = render(
			<ToolReceiptsSection
				receipts={{
					calls: [],
					writeCount: 0,
					errorCount: 0,
					totalCallCount: 0,
				}}
			/>
		);
		expect(container.firstChild).toBeNull();
	});
});
