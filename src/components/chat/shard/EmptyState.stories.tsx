import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./EmptyState";

const meta = {
	title: "Components/Chat/Empty state (shards)",
	component: EmptyState,
	args: {
		action: "show_staged" as const,
	},
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Staged: Story = {
	args: { action: "show_staged" },
};

export const Approved: Story = {
	args: { action: "show_approved" },
};

export const Rejected: Story = {
	args: { action: "show_rejected" },
};

export const DefaultFilter: Story = {
	args: { action: "other" },
};
