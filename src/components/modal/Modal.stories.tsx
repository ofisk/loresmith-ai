import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Modal } from "./Modal";

function ModalDemo(props: {
	clickOutsideToClose?: boolean;
	showCloseButton?: boolean;
	allowEscape?: boolean;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<Button type="button" variant="primary" onClick={() => setOpen(true)}>
				Open modal
			</Button>
			<Modal
				isOpen={open}
				onClose={() => setOpen(false)}
				options={{
					clickOutsideToClose: props.clickOutsideToClose ?? true,
					showCloseButton: props.showCloseButton ?? true,
					allowEscape: props.allowEscape ?? true,
				}}
				ariaLabelledBy="modal-story-title"
			>
				<div className="p-6 max-w-md">
					<h2 id="modal-story-title" className="text-lg font-semibold mb-2">
						Example dialog
					</h2>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						Modal content for Storybook. Close with the button, Escape, or
						outside click if enabled.
					</p>
					<Button
						type="button"
						variant="secondary"
						onClick={() => setOpen(false)}
					>
						Close
					</Button>
				</div>
			</Modal>
		</div>
	);
}

const meta = {
	title: "Components/Modal",
	component: ModalDemo,
	parameters: {
		layout: "centered",
	},
} satisfies Meta<typeof ModalDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoClickOutside: Story = {
	args: {
		clickOutsideToClose: false,
	},
};

export const NoEscape: Story = {
	args: {
		allowEscape: false,
		clickOutsideToClose: false,
	},
};
