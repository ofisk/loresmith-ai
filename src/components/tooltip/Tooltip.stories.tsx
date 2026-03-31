import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/button/Button";
import { Tooltip } from "./Tooltip";

const meta = {
	title: "Components/Tooltip",
	component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnButton: Story = {
	args: {
		content: "Short help text for this control",
		children: (
			<Button variant="secondary" type="button">
				Hover or focus me
			</Button>
		),
	},
};

export const OnSpanWrappedButton: Story = {
	args: {
		content: "Unavailable while processing",
		children: (
			<span className="inline-flex">
				<Button variant="ghost" type="button" disabled>
					Disabled with tooltip
				</Button>
			</span>
		),
	},
};
