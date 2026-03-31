import type { Meta, StoryObj } from "@storybook/react";
import { ThinkingSpinner } from "./ThinkingSpinner";

const meta = {
	title: "Components/Thinking spinner",
	component: ThinkingSpinner,
	tags: ["autodocs"],
} satisfies Meta<typeof ThinkingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithStatus: Story = {
	args: {
		status: "Searching campaign…",
	},
};

export const NoText: Story = {
	args: {
		showText: false,
	},
};
