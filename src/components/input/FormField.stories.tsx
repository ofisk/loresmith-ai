import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { FormField } from "./FormField";

function FormFieldDemo(
	props: Omit<ComponentProps<typeof FormField>, "value" | "onValueChange"> & {
		initialValue?: string;
	}
) {
	const { initialValue = "", ...rest } = props;
	const [value, setValue] = useState(initialValue);
	return (
		<div className="w-full max-w-md">
			<FormField {...rest} value={value} onValueChange={(v) => setValue(v)} />
		</div>
	);
}

const meta = {
	title: "Components/Form field",
	component: FormFieldDemo,
	args: {
		id: "story-field",
		label: "Display name",
		placeholder: "Enter a value",
		initialValue: "",
	},
} satisfies Meta<typeof FormFieldDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = {
	args: {
		required: true,
		label: "Email",
		placeholder: "you@example.com",
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
		initialValue: "Cannot edit",
	},
};

export const Multiline: Story = {
	args: {
		id: "story-notes",
		label: "Notes",
		multiline: true,
		rows: 4,
		placeholder: "Optional details...",
	},
};

export const WithTooltip: Story = {
	args: {
		label: "Username",
		tooltip: (
			<span>
				2–64 characters. Letters, numbers, underscore, or hyphen only.
			</span>
		),
	},
};
