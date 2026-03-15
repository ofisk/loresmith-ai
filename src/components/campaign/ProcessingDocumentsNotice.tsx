import { useCallback, useEffect, useState } from "react";
import { PROCESSING_DOCUMENTS_MESSAGE } from "@/constants/processing-documents-copy";

const STORAGE_KEY_PREFIX = "loresmith-processing-docs-notice-dismissed-";

interface ProcessingDocumentsNoticeProps {
	/** Campaign ID for dismiss key (notice is shown only when this campaign has processing). */
	campaignId: string | null;
	/** Whether the selected campaign has processing documents. */
	hasProcessingDocuments: boolean;
	className?: string;
}

export function ProcessingDocumentsNotice({
	campaignId,
	hasProcessingDocuments,
	className = "",
}: ProcessingDocumentsNoticeProps) {
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (!campaignId || !hasProcessingDocuments) {
			setDismissed(false);
			return;
		}
		try {
			const key = `${STORAGE_KEY_PREFIX}${campaignId}`;
			setDismissed(sessionStorage.getItem(key) === "1");
		} catch {
			setDismissed(false);
		}
	}, [campaignId, hasProcessingDocuments]);

	const handleDismiss = useCallback(() => {
		if (!campaignId) return;
		try {
			sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${campaignId}`, "1");
			setDismissed(true);
		} catch {
			setDismissed(true);
		}
	}, [campaignId]);

	if (!campaignId || !hasProcessingDocuments || dismissed) {
		return null;
	}

	return (
		<div
			className={`flex items-start gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/80 px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 ${className}`}
			aria-live="polite"
		>
			<p className="flex-1 min-w-0">{PROCESSING_DOCUMENTS_MESSAGE}</p>
			<button
				type="button"
				onClick={handleDismiss}
				className="shrink-0 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 rounded px-1.5 py-0.5"
				aria-label="Dismiss"
			>
				Dismiss
			</button>
		</div>
	);
}
