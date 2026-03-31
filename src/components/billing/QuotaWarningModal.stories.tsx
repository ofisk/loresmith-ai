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
		reason: "You have used all tokens included in your trial.",
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

export const TrialCopy: Story = {
	args: {
		reason: "Your trial token allowance is exhausted.",
		monthlyUsage: 50_000,
		monthlyLimit: 50_000,
	},
};
