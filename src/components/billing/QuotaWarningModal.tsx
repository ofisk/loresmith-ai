import { Modal } from "@/components/modal/Modal";

interface QuotaWarningModalProps {
	isOpen: boolean;
	onClose: () => void;
	reason: string;
	monthlyUsage?: number;
	monthlyLimit?: number;
	creditsRemaining?: number;
}

export function QuotaWarningModal({
	isOpen,
	onClose,
	reason,
	monthlyUsage,
	monthlyLimit,
}: QuotaWarningModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			showCloseButton={true}
			className="w-[96vw] max-w-[480px]"
		>
			<div className="p-6">
				<h3 className="text-lg font-semibold mb-2">
					Token quota limit reached
				</h3>
				<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
					{reason}
				</p>
				{monthlyUsage !== undefined && monthlyLimit !== undefined && (
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						Usage:{" "}
						<strong>
							{monthlyUsage.toLocaleString()} / {monthlyLimit.toLocaleString()}{" "}
							tokens
							{reason.includes("trial") ? "" : " this month"}
						</strong>
					</p>
				)}
				<div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4 mb-5">
					<p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
						Options to continue
					</p>
					<ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
						<li>
							<strong>Buy credits</strong> – Purchase one-time indexing credits
							to boost your quota
						</li>
						<li>
							<strong>Upgrade</strong> – Switch to Basic or Pro for higher
							limits
						</li>
					</ul>
				</div>
				<div className="flex justify-end gap-2">
					<a
						href="/billing?tab=credits"
						className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-800 dark:bg-neutral-200 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
					>
						Buy credits
					</a>
					<a
						href="/billing"
						className="px-4 py-2 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
					>
						View plans
					</a>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
					>
						Close
					</button>
				</div>
			</div>
		</Modal>
	);
}
