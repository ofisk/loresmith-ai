import { Modal } from "@/components/modal/Modal";

interface RateLimitReachedModalProps {
	isOpen: boolean;
	onClose: () => void;
	nextResetAt: string | null;
	reason?: string;
}

function formatResetTime(iso: string): string {
	try {
		const d = new Date(iso.replace(" ", "T"));
		return d.toLocaleString(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

const TIER_BENEFITS = {
	basic:
		"Several campaigns with room for sourcebooks, character sheets, and handouts. Great for one or two tables.",
	pro: "Unlimited campaigns and a large library. Run multiple tables or build a big collection of sourcebooks and adventures.",
} as const;

export function RateLimitReachedModal({
	isOpen,
	onClose,
	nextResetAt,
	reason,
}: RateLimitReachedModalProps) {
	const formattedReset = nextResetAt ? formatResetTime(nextResetAt) : null;

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="modal-size-sm">
			<div className="p-6">
				<h3 className="text-lg font-semibold mb-2">Rate limit reached</h3>
				<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
					{reason ??
						"You've reached your rate limit. Limits reset on a sliding window."}
				</p>
				{formattedReset && (
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						Next reset: <strong>{formattedReset}</strong>
					</p>
				)}
				<div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4 mb-5">
					<p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
						Upgrade for higher limits
					</p>
					<ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
						<li>
							<span className="font-medium text-neutral-700 dark:text-neutral-300">
								Basic:
							</span>{" "}
							{TIER_BENEFITS.basic}
						</li>
						<li>
							<span className="font-medium text-neutral-700 dark:text-neutral-300">
								Pro:
							</span>{" "}
							{TIER_BENEFITS.pro}
						</li>
					</ul>
				</div>
				<div className="flex justify-end gap-2 flex-wrap">
					{reason?.toLowerCase().includes("monthly") && (
						<a
							href="/billing?tab=credits"
							className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-800 dark:bg-neutral-200 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
						>
							Buy indexing credits
						</a>
					)}
					<a
						href="/billing"
						className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-800 dark:bg-neutral-200 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
					>
						View plans
					</a>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700"
					>
						Close
					</button>
				</div>
			</div>
		</Modal>
	);
}
