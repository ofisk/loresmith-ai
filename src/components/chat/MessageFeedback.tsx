import { ArrowClockwise, ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useState } from "react";

interface MessageFeedbackProps {
	messageId: string;
	onRegenerate?: (messageId?: string) => void | Promise<void>;
}

type Vote = "up" | "down" | null;

const buttonClass =
	"p-1.5 rounded-md transition-colors text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900";

/**
 * Thumbs up/down + regenerate footer shown under each assistant response.
 *
 * TODO(telemetry): the vote is currently local UI state only - nothing is
 * persisted or sent anywhere. Wire `onVote` to a real feedback/telemetry
 * endpoint once one exists, keyed by messageId.
 */
export function MessageFeedback({
	messageId,
	onRegenerate,
}: MessageFeedbackProps) {
	const [vote, setVote] = useState<Vote>(null);

	const toggleVote = (next: Vote) => {
		setVote((prev) => (prev === next ? null : next));
	};

	return (
		<div className="mt-2 flex items-center gap-1">
			<button
				type="button"
				onClick={() => toggleVote("up")}
				aria-pressed={vote === "up"}
				aria-label="Good response"
				title="Good response"
				className={vote === "up" ? `${buttonClass} !text-primary` : buttonClass}
			>
				<ThumbsUp
					size={16}
					weight={vote === "up" ? "fill" : "regular"}
					aria-hidden
				/>
			</button>
			<button
				type="button"
				onClick={() => toggleVote("down")}
				aria-pressed={vote === "down"}
				aria-label="Bad response"
				title="Bad response"
				className={
					vote === "down"
						? `${buttonClass} !text-red-600 dark:!text-red-400`
						: buttonClass
				}
			>
				<ThumbsDown
					size={16}
					weight={vote === "down" ? "fill" : "regular"}
					aria-hidden
				/>
			</button>
			{onRegenerate && (
				<button
					type="button"
					onClick={() => void onRegenerate(messageId)}
					aria-label="Regenerate response"
					title="Regenerate response"
					className={buttonClass}
				>
					<ArrowClockwise size={16} aria-hidden />
				</button>
			)}
		</div>
	);
}
