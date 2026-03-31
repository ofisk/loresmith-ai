import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Button } from "@/components/button/Button";
import { BlockingAuthenticationModal } from "./BlockingAuthenticationModal";

type ModalProps = ComponentProps<typeof BlockingAuthenticationModal>;

/** Re-open after a full page refresh; the live modal does not use Escape or backdrop close. */
function StatefulModal(props: Omit<ModalProps, "isOpen">) {
	const [open, setOpen] = useState(true);
	return (
		<div className="mx-auto min-h-[560px] w-full max-w-4xl">
			<Button type="button" variant="secondary" onClick={() => setOpen(true)}>
				Open modal
			</Button>
			<BlockingAuthenticationModal isOpen={open} {...props} />
		</div>
	);
}

const meta = {
	title: "Components/Blocking authentication modal",
	component: StatefulModal,
	parameters: {
		layout: "fullscreen",
	},
} satisfies Meta<typeof StatefulModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Choice: Story = {
	args: {},
};

export const SignInWithError: Story = {
	args: {
		initialError: "This link has expired. Request a new one or sign in below.",
	},
};

export const SignInWithSuccess: Story = {
	args: {
		initialSuccessMessage: "Email verified. You can sign in now.",
	},
};

export const GoogleChooseUsername: Story = {
	args: {
		googlePendingToken: "storybook-demo-pending-token",
	},
};
