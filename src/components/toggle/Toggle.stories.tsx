import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Toggle } from "./Toggle";

function TogglePlayground(props: { size?: "sm" | "base" | "lg" }) {
	const [on, setOn] = useState(false);
	return (
		<Toggle
			size={props.size ?? "base"}
			toggled={on}
			onClick={() => setOn((v) => !v)}
		/>
	);
}

const meta = {
	title: "Components/Toggle",
	component: TogglePlayground,
} satisfies Meta<typeof TogglePlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

export const Small: Story = {
	args: { size: "sm" },
};

export const Large: Story = {
	args: { size: "lg" },
};
