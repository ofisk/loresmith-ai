import type { Meta, StoryObj } from "@storybook/react";
import { Loader } from "./Loader";

const meta = {
	title: "Components/Loader",
	component: Loader,
	tags: ["autodocs"],
	args: {
		size: 24,
	},
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
	args: { size: 16 },
};

export const Large: Story = {
	args: { size: 40 },
};
