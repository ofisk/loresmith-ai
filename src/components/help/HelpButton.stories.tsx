import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { HelpButton } from "./HelpButton";

const meta = {
	title: "Components/Help button",
	component: HelpButton,
	args: {
		onActionClick: fn(),
	},
} satisfies Meta<typeof HelpButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
