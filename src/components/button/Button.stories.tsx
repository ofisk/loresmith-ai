import { FloppyDisk } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
	title: "Components/Button",
	component: Button,
	tags: ["autodocs"],
	args: {
		children: "Label",
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
	args: {
		variant: "primary",
		children: "Primary",
	},
};

export const Secondary: Story = {
	args: {
		variant: "secondary",
		children: "Secondary",
	},
};

export const Ghost: Story = {
	args: {
		variant: "ghost",
		children: "Ghost",
	},
};

export const Destructive: Story = {
	args: {
		variant: "destructive",
		children: "Delete",
	},
};

export const Loading: Story = {
	args: {
		variant: "primary",
		loading: true,
		children: "Saving…",
	},
};

export const WithTooltip: Story = {
	args: {
		variant: "secondary",
		tooltip: "Extra context for this control",
		children: "Hover or focus",
	},
};

export const FormPrimary: Story = {
	args: {
		appearance: "form",
		variant: "primary",
		children: "Save changes",
	},
};

export const FormSecondary: Story = {
	args: {
		appearance: "form",
		variant: "secondary",
		children: "Cancel",
	},
};

export const FormWithIcon: Story = {
	args: {
		appearance: "form",
		variant: "primary",
		icon: <FloppyDisk size={16} aria-hidden />,
		children: "Save",
	},
};

export const FormLoading: Story = {
	args: {
		appearance: "form",
		variant: "primary",
		loading: true,
		children: "Saving…",
	},
};
