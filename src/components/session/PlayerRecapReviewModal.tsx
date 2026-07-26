import { Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";
import { Modal } from "@/components/modal/Modal";
import { usePlayerRecaps } from "@/hooks/usePlayerRecaps";
import type { PlayerRecapRecipient } from "@/types/player-recap";
import type { SessionDigestWithData } from "@/types/session-digest";

interface PlayerRecapReviewModalProps {
	isOpen: boolean;
	onClose: () => void;
	campaignId: string;
	digest: SessionDigestWithData | null;
}

const EXCLUSION_LABELS: Record<PlayerRecapRecipient["reason"], string> = {
	ok: "",
	no_email: "no email on their account",
	email_unverified: "email not verified",
	unsubscribed: "unsubscribed from recaps",
};

const SECTION_LABELS: Record<string, string> = {
	whatHappened: "What happened",
	notableNpcs: "Who you met",
	placesVisited: "Where you went",
	factionDevelopments: "Word around the world",
	unresolvedThreads: "Loose ends",
};

/**
 * GM review-and-edit step before a recap reaches players.
 *
 * The send button is intentionally two-stage. Everything else in the app is
 * undoable; this is not, so the GM confirms the audience size after seeing the
 * body they are about to mail.
 */
export function PlayerRecapReviewModal({
	isOpen,
	onClose,
	campaignId,
	digest,
}: PlayerRecapReviewModalProps) {
	const {
		draft,
		recipients,
		loading,
		error,
		fetchRecipients,
		generateDraft,
		saveDraft,
		sendRecap,
		clearDraft,
	} = usePlayerRecaps();

	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [sendSummary, setSendSummary] = useState<string | null>(null);

	// Draft on open, once per digest.
	useEffect(() => {
		if (!isOpen || !digest) return;
		setConfirming(false);
		setSendSummary(null);
		clearDraft();
		void fetchRecipients(campaignId);
		void generateDraft(campaignId, digest.id);
		// biome-ignore lint/correctness/useExhaustiveDependencies: run once per open/digest
	}, [isOpen, digest?.id, campaignId]);

	// Seed the editors from the generated draft.
	useEffect(() => {
		if (draft?.recap) {
			setSubject(draft.recap.subject);
			setBody(draft.recap.bodyMarkdown);
		}
	}, [draft?.recap]);

	const eligible = useMemo(
		() => recipients.filter((r) => r.eligible),
		[recipients]
	);
	const excluded = useMemo(
		() => recipients.filter((r) => !r.eligible),
		[recipients]
	);

	const isSent = draft?.recap?.status === "sent";
	const spoilerFlags = draft?.spoilerFlags ?? [];
	const dirty =
		draft?.recap != null &&
		(subject !== draft.recap.subject || body !== draft.recap.bodyMarkdown);

	const handleSend = async () => {
		if (!draft?.recap) return;

		// Persist pending edits first: what gets mailed is what the GM sees.
		if (dirty) {
			const saved = await saveDraft(campaignId, draft.recap.id, {
				subject,
				bodyMarkdown: body,
			});
			if (!saved) return;
		}

		const result = await sendRecap(campaignId, draft.recap.id);
		if (!result) return;

		setConfirming(false);
		setSendSummary(
			`Sent to ${result.sent} player${result.sent === 1 ? "" : "s"}` +
				(result.failed > 0 ? `, ${result.failed} failed` : "") +
				(result.skipped > 0 ? `, ${result.skipped} skipped` : "")
		);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="modal-size-standard">
			<div className="p-6 overflow-y-auto max-h-[var(--height-scrollable-modal)]">
				<div className="mb-5">
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						Review player recap
					</h2>
					<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
						{digest
							? `Session ${digest.sessionNumber} — read this through before sending. Players cannot unsee it.`
							: "Select a session digest first."}
					</p>
				</div>

				{error && (
					<div className="mb-4 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
						{error}
					</div>
				)}

				{sendSummary && (
					<div className="mb-4 rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-700 dark:text-green-300">
						{sendSummary}
					</div>
				)}

				{spoilerFlags.length > 0 && !isSent && (
					<div className="mb-4 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3">
						<div className="flex items-start gap-2">
							<Warning
								size={18}
								className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
							/>
							<div className="text-sm text-amber-800 dark:text-amber-200">
								<p className="font-semibold mb-1">
									{spoilerFlags.length} line
									{spoilerFlags.length === 1 ? "" : "s"} may contain GM-only
									knowledge
								</p>
								<p className="mb-2 text-amber-700 dark:text-amber-300">
									Nothing was removed — check these read the way you want
									players to see them.
								</p>
								<ul className="space-y-1">
									{spoilerFlags.map((flag) => (
										<li key={`${flag.section}-${flag.index}`}>
											<span className="opacity-70">
												{SECTION_LABELS[flag.section] ?? flag.section}:
											</span>{" "}
											{flag.text}{" "}
											<span className="opacity-70">
												(matched “{flag.match}”)
											</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				)}

				<div className="mb-4 rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
					<p className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">
						{eligible.length} player{eligible.length === 1 ? "" : "s"} will
						receive this
					</p>
					{eligible.length > 0 && (
						<p className="text-neutral-600 dark:text-neutral-300">
							{eligible.map((r) => r.username).join(", ")}
						</p>
					)}
					{excluded.length > 0 && (
						<ul className="mt-2 space-y-0.5 text-neutral-500 dark:text-neutral-400">
							{excluded.map((r) => (
								<li key={r.username}>
									{r.username} — {EXCLUSION_LABELS[r.reason]}
								</li>
							))}
						</ul>
					)}
				</div>

				<label
					htmlFor="recap-subject"
					className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1"
				>
					Subject
				</label>
				<input
					id="recap-subject"
					type="text"
					value={subject}
					disabled={isSent}
					onChange={(e) => setSubject(e.target.value)}
					className="w-full mb-4 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 disabled:opacity-60"
				/>

				<label
					htmlFor="recap-body"
					className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1"
				>
					Body (markdown)
				</label>
				<textarea
					id="recap-body"
					value={body}
					rows={14}
					disabled={isSent}
					onChange={(e) => setBody(e.target.value)}
					className="w-full mb-4 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-900 dark:text-neutral-100 disabled:opacity-60"
				/>

				<div className="mb-5">
					<p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
						Preview
					</p>
					<div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-900/60">
						<MemoizedMarkdown content={body} />
					</div>
				</div>

				<div className="flex flex-col sm:flex-row sm:justify-end gap-2">
					<Button appearance="form" variant="secondary" onClick={onClose}>
						{isSent ? "Close" : "Cancel"}
					</Button>

					{!isSent && (
						<>
							<Button
								appearance="form"
								variant="secondary"
								loading={loading}
								disabled={!draft?.recap || !dirty}
								onClick={() => {
									if (draft?.recap) {
										void saveDraft(campaignId, draft.recap.id, {
											subject,
											bodyMarkdown: body,
										});
									}
								}}
							>
								Save draft
							</Button>

							{confirming ? (
								<Button
									appearance="form"
									variant="destructive"
									loading={loading}
									onClick={handleSend}
								>
									Confirm — send to {eligible.length} player
									{eligible.length === 1 ? "" : "s"}
								</Button>
							) : (
								<Button
									appearance="form"
									variant="primary"
									disabled={loading || !draft?.recap || eligible.length === 0}
									onClick={() => setConfirming(true)}
								>
									Send recap
								</Button>
							)}
						</>
					)}
				</div>
			</div>
		</Modal>
	);
}
