import { RATE_LIMITS } from "@/app-constants";
import { Modal } from "@/components/modal/Modal";

interface UsageLimitsModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Limits from API (optional); falls back to RATE_LIMITS when not provided */
	limits?: {
		tph?: number;
		qph?: number;
		tpd?: number;
		qpd?: number;
		resourcesPerCampaignPerHour?: number;
	};
}

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
	return n.toLocaleString();
}

export function UsageLimitsModal({
	isOpen,
	onClose,
	limits,
}: UsageLimitsModalProps) {
	const tph = limits?.tph ?? RATE_LIMITS.NON_ADMIN_TPH;
	const qph = limits?.qph ?? RATE_LIMITS.NON_ADMIN_QPH;
	const tpd = limits?.tpd ?? RATE_LIMITS.NON_ADMIN_TPD;
	const qpd = limits?.qpd ?? RATE_LIMITS.NON_ADMIN_QPD;
	const resourcesPerCampaignPerHour =
		limits?.resourcesPerCampaignPerHour ??
		RATE_LIMITS.RESOURCES_PER_CAMPAIGN_PER_HOUR;

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="modal-size-sm">
			<div className="p-6">
				<h3 className="text-lg font-semibold mb-2">Usage limits</h3>
				<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
					These limits apply to non-admin users. Limits reset on a sliding
					window.
				</p>
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-neutral-200 dark:border-neutral-700">
							<th className="text-left py-2 font-medium">Limit</th>
							<th className="text-right py-2 font-medium">Amount</th>
						</tr>
					</thead>
					<tbody className="text-neutral-600 dark:text-neutral-400">
						<tr className="border-b border-neutral-100 dark:border-neutral-800">
							<td className="py-2">Tokens per hour</td>
							<td className="text-right py-2">{formatNumber(tph)} tokens/hr</td>
						</tr>
						<tr className="border-b border-neutral-100 dark:border-neutral-800">
							<td className="py-2">Queries per hour</td>
							<td className="text-right py-2">
								{formatNumber(qph)} queries/hr
							</td>
						</tr>
						<tr className="border-b border-neutral-100 dark:border-neutral-800">
							<td className="py-2">Tokens per day</td>
							<td className="text-right py-2">
								{formatNumber(tpd)} tokens/day
							</td>
						</tr>
						<tr className="border-b border-neutral-100 dark:border-neutral-800">
							<td className="py-2">Queries per day</td>
							<td className="text-right py-2">{qpd} queries/day</td>
						</tr>
						<tr>
							<td className="py-2">Resources per campaign per hour</td>
							<td className="text-right py-2">
								{resourcesPerCampaignPerHour} adds/hr
							</td>
						</tr>
					</tbody>
				</table>
				<div className="flex justify-end mt-4">
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
