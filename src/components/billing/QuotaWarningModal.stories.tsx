import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/button/Button";
import { QuotaWarningModal } from "./QuotaWarningModal";

type Props = ComponentProps<typeof QuotaWarningModal>;

function ModalFrame(props: Omit<Props, "isOpen" | "onClose">) {
	const [open, setOpen] = useState(true);
	return (
		<div>
			<Button type="button" variant="secondary" onClick={() => setOpen(true)}>
				Open modal
			</Button>
			<QuotaWarningModal
				{...props}
				isOpen={open}
				onClose={() => setOpen(false)}
			/>
		</div>
	);
}

const meta = {
	title: "Components/Quota warning modal",
	component: ModalFrame,
	args: {
		reason:
			"Free token allowance used up. Your 50,000 monthly tokens refresh on September 1 — your campaigns stay readable in the meantime. Upgrade or purchase credits to keep generating now.",
	},
} satisfies Meta<typeof ModalFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const WithMonthlyUsage: Story = {
	args: {
		reason: "Monthly limit reached for your plan.",
		monthlyUsage: 1_200_000,
		monthlyLimit: 1_200_000,
		creditsRemaining: 0,
	},
};

/** Free tier with both buckets drained: the copy must say the allowance returns. */
export const FreeTierExhausted: Story = {
	args: {
		monthlyUsage: 200_000,
		monthlyLimit: 200_000,
		creditsRemaining: 0,
	},
};

/** Blocked on one expensive action while allowance remains. */
export const ActionTooLarge: Story = {
	args: {
		reason:
			"This needs about 20,000 tokens and you have 5,000 left. Purchase credits, upgrade, or wait for your monthly allowance to refresh.",
		monthlyUsage: 195_000,
		monthlyLimit: 200_000,
	},
};
