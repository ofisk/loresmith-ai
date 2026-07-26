import { ArrowClockwise, StopCircle } from "@phosphor-icons/react";

interface InterruptedNoticeProps {
	/** Whether the reply was stopped before it finished. */
	interrupted: boolean;
	/** The notice belongs after the final text part of a reply, not each one. */
	isLastTextPart: boolean;
	/** When provided, a Continue button is shown that resumes the reply. */
	onContinue?: () => void;
}

/**
 * Shown under an assistant reply that was stopped before it finished, so a
 * partial answer is never mistaken for a complete one.
 *
 * The flag is set both locally (the moment Stop is pressed) and server-side on
 * the persisted message, so the notice survives a reload.
 *
 * Deciding whether to render happens here rather than at the call site: the
 * message-parts loop it sits in is already at the repo's complexity ceiling.
 */
export function InterruptedNotice({
	interrupted,
	isLastTextPart,
	onContinue,
}: InterruptedNoticeProps) {
	if (!interrupted || !isLastTextPart) return null;

	return (
		<div className="mt-2 px-1 flex items-center gap-2 flex-wrap">
			<span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
				<StopCircle size={14} weight="fill" aria-hidden />
				Stopped — this reply is incomplete.
			</span>
			{onContinue && (
				<button
					type="button"
					onClick={onContinue}
					className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 rounded-sm cursor-pointer"
				>
					<ArrowClockwise size={12} aria-hidden />
					Continue
				</button>
			)}
		</div>
	);
}
