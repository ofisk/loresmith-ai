import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import {
	PDF_PROCESSING_STEPS,
	type ProcessingProgress,
	type ProcessingStep,
} from "@/types/progress";
import { ProcessingProgressBar } from "./ProcessingProgressBar";

function buildSteps(
	phase: "processing" | "completed" | "error"
): ProcessingStep[] {
	return PDF_PROCESSING_STEPS.slice(0, 5).map((def, i) => {
		if (phase === "completed") {
			return {
				...def,
				status: "completed",
				progress: 100,
			};
		}
		if (phase === "error" && i === 2) {
			return {
				...def,
				status: "error",
				progress: 40,
				error: "Example failure message",
			};
		}
		if (phase === "error") {
			return {
				...def,
				status: i < 2 ? "completed" : "pending",
				progress: i < 2 ? 100 : 0,
			};
		}
		// processing
		if (i < 2) {
			return { ...def, status: "completed", progress: 100 };
		}
		if (i === 2) {
			return { ...def, status: "processing", progress: 55 };
		}
		return { ...def, status: "pending", progress: 0 };
	});
}

function sampleProgress(
	overrides: Partial<ProcessingProgress> & {
		_phase?: "processing" | "completed" | "error";
	} = {}
): ProcessingProgress {
	const phase = overrides._phase ?? "processing";
	const { _phase, ...rest } = overrides;
	const steps = buildSteps(phase);
	const processingName =
		steps.find((s) => s.status === "processing")?.name ?? "Extracting text";
	return {
		fileKey: "demo/user/session/handbook.pdf",
		username: "demo",
		overallProgress: phase === "completed" ? 100 : phase === "error" ? 35 : 42,
		currentStep: phase === "completed" ? "Done" : processingName,
		steps,
		startTime: Date.now() - 125_000,
		estimatedTimeRemaining:
			phase === "completed" || phase === "error" ? undefined : 88,
		status:
			phase === "completed"
				? "completed"
				: phase === "error"
					? "error"
					: "processing",
		...(phase === "error"
			? { error: "Processing stopped due to an error." }
			: {}),
		...rest,
	};
}

const meta = {
	title: "Components/Processing progress bar",
	component: ProcessingProgressBar,
} satisfies Meta<typeof ProcessingProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Processing: Story = {
	args: {
		progress: sampleProgress(),
	},
};

export const Completed: Story = {
	args: {
		progress: sampleProgress({ _phase: "completed" }),
	},
};

export const ErrorState: Story = {
	args: {
		progress: sampleProgress({ _phase: "error" }),
	},
};

export const WithClose: Story = {
	args: {
		progress: sampleProgress(),
		onClose: fn(),
	},
};
