import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta = {
	title: "Components/Card",
	component: Card,
	tags: ["autodocs"],
	args: {
		children: "Card body content goes here.",
	},
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {
	args: {
		variant: "secondary",
	},
};

export const Primary: Story = {
	args: {
		variant: "primary",
	},
};
