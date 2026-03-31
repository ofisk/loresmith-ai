import type { Meta, StoryObj } from "@storybook/react";
import { PrimaryActionButton } from "./PrimaryActionButton";

const meta = {
	title: "Components/Primary action button",
	component: PrimaryActionButton,
	args: {
		children: "Continue",
	},
} satisfies Meta<typeof PrimaryActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};
