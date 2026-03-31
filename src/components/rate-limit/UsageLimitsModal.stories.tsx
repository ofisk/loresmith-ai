import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/button/Button";
import { UsageLimitsModal } from "./UsageLimitsModal";

type Props = ComponentProps<typeof UsageLimitsModal>;

function ModalFrame(props: Omit<Props, "isOpen" | "onClose">) {
	const [open, setOpen] = useState(true);
	return (
		<div>
			<Button type="button" variant="secondary" onClick={() => setOpen(true)}>
				Open modal
			</Button>
			<UsageLimitsModal
				{...props}
				isOpen={open}
				onClose={() => setOpen(false)}
			/>
		</div>
	);
}

const meta = {
	title: "Components/Usage limits modal",
	component: ModalFrame,
} satisfies Meta<typeof ModalFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const CustomLimits: Story = {
	args: {
		limits: {
			tph: 500_000,
			qph: 120,
			tpd: 2_000_000,
			qpd: 800,
			resourcesPerCampaignPerHour: 25,
		},
	},
};
