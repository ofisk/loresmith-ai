import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CollapsibleCard } from "./CollapsibleCard";

function CollapsiblePlayground() {
	const [open, setOpen] = useState(true);
	return (
		<div className="w-full max-w-md">
			<CollapsibleCard
				header={
					<span className="font-medium text-neutral-900 dark:text-neutral-100">
						Section title
					</span>
				}
				isOpen={open}
				onToggle={() => setOpen((v) => !v)}
			>
				<div className="p-3 text-sm text-neutral-600 dark:text-neutral-400">
					Body content when expanded.
				</div>
			</CollapsibleCard>
		</div>
	);
}

const meta = {
	title: "Components/Collapsible card",
	component: CollapsiblePlayground,
	tags: ["autodocs"],
	parameters: {
		layout: "centered",
	},
} satisfies Meta<typeof CollapsiblePlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
