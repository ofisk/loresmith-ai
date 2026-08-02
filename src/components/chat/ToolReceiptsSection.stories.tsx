import type { Meta, StoryObj } from "@storybook/react";
import type { ToolReceipts } from "@/types/tool-receipt";
import { ToolReceiptsSection } from "./ToolReceiptsSection";

/** The turn from the issue: a search, a create, a link, and a world-state write. */
const MIXED: ToolReceipts = {
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
			detail: "Captain Vane",
			outcome: "Entity updated",
			entities: [{ id: "e1", name: "Captain Vane" }],
		},
		{
			toolName: "createEntityRelationshipTool",
			label: "Create entity relationship",
			effect: "write",
			status: "ok",
			detail: "member of",
			outcome: "Relationship created successfully",
			entities: [
				{ id: "e1", name: "Captain Vane" },
				{ id: "e2", name: "The Iron Coast" },
			],
		},
		{
			toolName: "listAllEntities",
			label: "List all entities",
			effect: "read",
			status: "ok",
			outcome: "18 entities",
		},
	],
	writeCount: 2,
	errorCount: 0,
	totalCallCount: 4,
};

/** A turn where a tool failed and the retry went through. */
const WITH_FAILURE: ToolReceipts = {
	calls: [
		{
			toolName: "updateEntityWorldStateTool",
			label: "Update entity world state",
			effect: "write",
			status: "error",
			detail: "Captain Vane",
			outcome: "Entity not found in this campaign",
		},
		{
			toolName: "searchCampaignContext",
			label: "Search campaign context",
			effect: "read",
			status: "ok",
			detail: "Vane",
			outcome: "1 match",
		},
		{
			toolName: "updateEntityWorldStateTool",
			label: "Update entity world state",
			effect: "write",
			status: "ok",
			detail: "Captain Vane",
			outcome: "World state updated",
			entities: [{ id: "e1", name: "Captain Vane" }],
		},
	],
	writeCount: 2,
	errorCount: 1,
	totalCallCount: 3,
};

/** Nothing was changed — the answer came entirely from lookups. */
const READ_ONLY: ToolReceipts = {
	calls: [
		{
			toolName: "searchCampaignContext",
			label: "Search campaign context",
			effect: "read",
			status: "ok",
			detail: "who runs the docks",
			outcome: "no matches",
		},
		{
			toolName: "listAllEntities",
			label: "List all entities",
			effect: "read",
			status: "ok",
			outcome: "18 entities",
			attempts: 2,
		},
	],
	writeCount: 0,
	errorCount: 0,
	totalCallCount: 3,
};

const meta = {
	title: "Chat/Tool receipts",
	component: ToolReceiptsSection,
	parameters: { layout: "centered" },
	decorators: [
		(Story) => (
			<div className="w-[560px] max-w-full">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ToolReceiptsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed by default — one line saying how much happened. */
export const Collapsed: Story = {
	args: { receipts: MIXED, campaignId: "camp-1" },
};

/** The same turn opened up: writes carry a violet rail, reads stay flat. */
export const Expanded: Story = {
	args: { receipts: MIXED, campaignId: "camp-1", collapsedByDefault: false },
};

/** A failure is shown as a failure, not folded into the successful retry. */
export const WithFailure: Story = {
	args: {
		receipts: WITH_FAILURE,
		campaignId: "camp-1",
		collapsedByDefault: false,
	},
};

/** The reassuring case: the agent looked, and changed nothing. */
export const ReadOnly: Story = {
	args: {
		receipts: READ_ONLY,
		campaignId: "camp-1",
		collapsedByDefault: false,
	},
};
