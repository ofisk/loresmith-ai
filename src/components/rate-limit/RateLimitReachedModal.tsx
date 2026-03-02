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

export function RateLimitReachedModal({
	isOpen,
	onClose,
	nextResetAt,
	reason,
}: RateLimitReachedModalProps) {
	const formattedReset = nextResetAt ? formatResetTime(nextResetAt) : null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			showCloseButton={true}
			className="w-[96vw] max-w-[420px]"
		>
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
				<div className="flex justify-end gap-2">
					<a
						href="/billing"
						className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-800 dark:bg-neutral-200 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
					>
						Upgrade to increase limits
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
