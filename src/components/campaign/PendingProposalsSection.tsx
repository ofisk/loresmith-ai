import { Check, DownloadSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { FormButton } from "@/components/button/FormButton";
import { Modal } from "@/components/modal/Modal";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";

interface Proposal {
	id: string;
	campaignId: string;
	fileKey: string;
	fileName: string;
	proposedBy: string;
	status: string;
	createdAt: string;
}

interface PendingProposalsSectionProps {
	campaignId: string;
	onProposalProcessed?: () => void;
}

export function PendingProposalsSection({
	campaignId,
	onProposalProcessed,
}: PendingProposalsSectionProps) {
	const [proposals, setProposals] = useState<Proposal[]>([]);
	const [loading, setLoading] = useState(true);
	const [processingId, setProcessingId] = useState<string | null>(null);
	const [downloadDisclaimerProposal, setDownloadDisclaimerProposal] =
		useState<Proposal | null>(null);
	const { makeRequest } = useAuthenticatedRequest();

	const fetchProposals = useCallback(async () => {
		setLoading(true);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(campaignId)
				)
			);
			const data = (await res.json()) as { proposals?: Proposal[] };
			if (res.ok && data.proposals) {
				setProposals(data.proposals);
			}
		} catch {
			setProposals([]);
		} finally {
			setLoading(false);
		}
	}, [campaignId, makeRequest]);

	useEffect(() => {
		fetchProposals();
	}, [fetchProposals]);

	const handleApprove = async (id: string) => {
		setProcessingId(id);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_APPROVE(
						campaignId,
						id
					)
				),
				{ method: "POST" }
			);
			if (res.ok) {
				fetchProposals();
				onProposalProcessed?.();
			}
		} finally {
			setProcessingId(null);
		}
	};

	const handleReject = async (id: string) => {
		setProcessingId(id);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_REJECT(
						campaignId,
						id
					)
				),
				{ method: "POST" }
			);
			if (res.ok) {
				fetchProposals();
				onProposalProcessed?.();
			}
		} finally {
			setProcessingId(null);
		}
	};

	const handleDownloadClick = (p: Proposal) => {
		setDownloadDisclaimerProposal(p);
	};

	const handleDownloadConfirm = async () => {
		if (!downloadDisclaimerProposal) return;
		const p = downloadDisclaimerProposal;
		setDownloadDisclaimerProposal(null);
		setProcessingId(p.id);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_DOWNLOAD(
						campaignId,
						p.id
					)
				)
			);
			if (res.ok) {
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = p.fileName;
				a.click();
				URL.revokeObjectURL(url);
			}
		} finally {
			setProcessingId(null);
		}
	};

	const handleDownloadCancel = () => {
		setDownloadDisclaimerProposal(null);
	};

	if (loading || proposals.length === 0) {
		if (loading) {
			return (
				<div className="mb-4 p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/50 text-sm text-neutral-500">
					Loading proposals…
				</div>
			);
		}
		return null;
	}

	return (
		<div className="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10">
			<h4 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
				Pending proposals
			</h4>
			<ul className="space-y-2">
				{proposals.map((p) => (
					<li
						key={p.id}
						className="flex items-center justify-between gap-2 text-sm"
					>
						<span className="text-neutral-700 dark:text-neutral-300 truncate">
							{p.fileName} (from {p.proposedBy})
						</span>
						<div className="flex gap-1 flex-shrink-0">
							<button
								type="button"
								onClick={() => handleDownloadClick(p)}
								disabled={processingId !== null}
								className="p-1.5 rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-600 dark:hover:bg-neutral-500 text-neutral-800 dark:text-neutral-200 disabled:opacity-50"
								title="Download for review"
							>
								<DownloadSimple size={14} />
							</button>
							<button
								type="button"
								onClick={() => handleApprove(p.id)}
								disabled={processingId !== null}
								className="p-1.5 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
								title="Approve"
							>
								<Check size={14} />
							</button>
							<button
								type="button"
								onClick={() => handleReject(p.id)}
								disabled={processingId !== null}
								className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
								title="Reject"
							>
								<X size={14} />
							</button>
						</div>
					</li>
				))}
			</ul>

			{/* Download disclaimer modal */}
			<Modal
				isOpen={downloadDisclaimerProposal !== null}
				onClose={handleDownloadCancel}
				showCloseButton={true}
			>
				<div className="p-6">
					<h3 className="text-lg font-semibold mb-4">
						Download file for review
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
						{downloadDisclaimerProposal ? (
							<>
								This file was shared by{" "}
								<strong>{downloadDisclaimerProposal.proposedBy}</strong>. Files
								are not scanned for malware. Only download if you trust this
								sender.
							</>
						) : null}
					</p>
					<div className="flex justify-end gap-2">
						<FormButton variant="secondary" onClick={handleDownloadCancel}>
							Cancel
						</FormButton>
						<FormButton variant="primary" onClick={handleDownloadConfirm}>
							I trust this sender, download
						</FormButton>
					</div>
				</div>
			</Modal>
		</div>
	);
}
