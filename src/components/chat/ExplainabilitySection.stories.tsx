import type { Meta, StoryObj } from "@storybook/react";
import type { Explainability } from "@/types/explainability";
import { ExplainabilitySection } from "./ExplainabilitySection";

const GROUNDED: Explainability = {
	rationale:
		"Based on 3 entities, 1 session digest section, 2 file excerpts from your campaign.",
	grounding: "grounded",
	topScore: 0.87,
	totalSourceCount: 6,
	queryId: "story-query",
	contextSources: [
		{
			type: "entity",
			source: "entity_graph",
			id: "e1",
			title: "Mara Quill",
			entityType: "npc",
			score: 0.87,
			scoreIsSemantic: true,
			snippet:
				"A retired smuggler who runs the Drowned Lantern on the dock road. Keeps a ledger of every favour owed to her.",
		},
		{
			type: "entity",
			source: "entity_graph",
			id: "e2",
			title: "The Drowned Lantern",
			entityType: "location",
			score: 0.64,
			scoreIsSemantic: true,
			snippet:
				"A low-ceilinged tavern built into the seawall. The back room is where the harbour crews settle debts.",
		},
		{
			type: "entity",
			source: "graph_traversal",
			id: "e3",
			title: "Corvin Ashe",
			entityType: "npc",
			score: 0.6,
			scoreIsSemantic: false,
			traversalDepth: 1,
			snippet: "Harbourmaster. Owes Mara a considerable sum.",
		},
		{
			type: "planning_context",
			source: "session_digest",
			id: "d1",
			sessionNumber: 7,
			sessionDate: "2026-05-14",
			sectionType: "key_events",
			score: 0.71,
			scoreIsSemantic: true,
			snippet:
				"The party burned Mara's ledger rather than hand it to the harbourmaster.",
		},
		{
			type: "file_content",
			source: "original_file",
			id: "file-key-1",
			fileKey: "file-key-1",
			title: "Saltmarsh Gazetteer.pdf",
			chunkIndex: 12,
			snippet:
				"The dock road runs the length of the seawall, lined with warehouses that flood at spring tide.",
		},
		{
			type: "file_content",
			source: "original_file",
			id: "file-key-2",
			fileKey: "file-key-2",
			title: "Session 7 Prep.md",
			chunkIndex: 2,
			snippet: "If the players press Corvin, he offers the manifest instead.",
		},
	],
};

const WEAK: Explainability = {
	rationale:
		"Based on 2 entities from your campaign. Nothing matched the question strongly — check the sources before relying on this.",
	grounding: "weak",
	topScore: 0.34,
	totalSourceCount: 2,
	queryId: "story-query-weak",
	contextSources: [
		{
			type: "entity",
			source: "entity_graph",
			id: "e9",
			title: "Hollowreach Keep",
			entityType: "location",
			score: 0.34,
			scoreIsSemantic: true,
			snippet: "A ruined border fort, abandoned since the second siege.",
		},
		{
			type: "entity",
			source: "graph_traversal",
			id: "e10",
			title: "Siege of Hollowreach",
			entityType: "event",
			score: 0.5,
			scoreIsSemantic: false,
			traversalDepth: 2,
		},
	],
};

const UNGROUNDED: Explainability = {
	rationale:
		"No matching campaign context was found, so this answer is not grounded in your materials.",
	grounding: "ungrounded",
	totalSourceCount: 0,
	contextSources: [],
};

const meta = {
	title: "Chat/Sources panel",
	component: ExplainabilitySection,
	parameters: { layout: "centered" },
	decorators: [
		(Story) => (
			<div className="w-[560px] max-w-full">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ExplainabilitySection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Retrieval found strong matches; the panel is collapsed by default. */
export const Grounded: Story = {
	args: { explainability: GROUNDED, campaignId: "camp-1" },
};

/** The same response with the sources revealed. */
export const GroundedExpanded: Story = {
	args: {
		explainability: GROUNDED,
		campaignId: "camp-1",
		collapsedByDefault: false,
	},
};

/** Sources came back, but nothing matched the question strongly. */
export const WeakMatch: Story = {
	args: {
		explainability: WEAK,
		campaignId: "camp-1",
		collapsedByDefault: false,
	},
};

/** The failure mode this exists to make visible: an unsourced answer. */
export const Ungrounded: Story = {
	args: { explainability: UNGROUNDED, campaignId: "camp-1" },
};
