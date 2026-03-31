import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

const meta = {
	title: "Components/Confirm delete button",
	component: ConfirmDeleteButton,
	args: {
		onConfirm: fn(),
	},
} satisfies Meta<typeof ConfirmDeleteButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabels: Story = {
	args: {
		label: "Remove file",
		confirmLabel: "Yes, remove file",
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};
