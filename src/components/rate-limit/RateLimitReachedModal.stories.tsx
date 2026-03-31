import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/button/Button";
import { RateLimitReachedModal } from "./RateLimitReachedModal";

type Props = ComponentProps<typeof RateLimitReachedModal>;

function ModalFrame(props: Omit<Props, "isOpen" | "onClose">) {
	const [open, setOpen] = useState(true);
	return (
		<div>
			<Button type="button" variant="secondary" onClick={() => setOpen(true)}>
				Open modal
			</Button>
			<RateLimitReachedModal
				{...props}
				isOpen={open}
				onClose={() => setOpen(false)}
			/>
		</div>
	);
}

const meta = {
	title: "Components/Rate limit reached modal",
	component: ModalFrame,
	args: {
		nextResetAt: null as string | null,
	},
} satisfies Meta<typeof ModalFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const WithNextReset: Story = {
	args: {
		nextResetAt: "2026-04-01 15:00:00",
	},
};

export const CustomReason: Story = {
	args: {
		reason: "You have hit the hourly query cap for your plan.",
		nextResetAt: "2026-03-31 18:00:00",
	},
};

export const MonthlyQuota: Story = {
	args: {
		reason: "Monthly token quota exceeded for your subscription.",
	},
};
