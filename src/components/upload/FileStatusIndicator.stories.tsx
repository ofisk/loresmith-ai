import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { FILE_UPLOAD_STATUS } from "@/lib/file/file-upload-status";
import { FileStatusIndicator } from "./FileStatusIndicator";

const meta = {
	title: "Components/File status indicator",
	component: FileStatusIndicator,
	args: {
		tenant: "storybook",
		fileKey: "demo/key/handbook.pdf",
		fileName: "handbook.pdf",
		fileSize: 2_048_000,
		onRetry: fn(),
	},
} satisfies Meta<typeof FileStatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {
	args: { initialStatus: FILE_UPLOAD_STATUS.UPLOADED },
};

export const Processing: Story = {
	args: { initialStatus: FILE_UPLOAD_STATUS.PROCESSING },
};

export const Completed: Story = {
	args: { initialStatus: FILE_UPLOAD_STATUS.COMPLETED },
};

export const Failed: Story = {
	args: { initialStatus: FILE_UPLOAD_STATUS.ERROR },
};

export const RetryDisabled: Story = {
	args: {
		initialStatus: FILE_UPLOAD_STATUS.ERROR,
		retryLimitDisabled: true,
		retryLimitTooltip: "Rate limit reached. Try again later.",
	},
};
