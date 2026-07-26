import { Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button/Button";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";
import { Modal } from "@/components/modal/Modal";
import { usePlayerRecaps } from "@/hooks/usePlayerRecaps";
import type { SpoilerFlag } from "@/lib/player-recap/player-safe-digest";
import type {
	PlayerRecapEmail,
	PlayerRecapRecipient,
} from "@/types/player-recap";
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

/** "player" / "players" — the copy pluralizes in half a dozen places. */
function plural(count: number): string {
	return count === 1 ? "" : "s";
}

/**
 * Advisory spoiler notice. Nothing is redacted — the GM decides, so this only
 * points at lines worth a second read.
 */
function SpoilerNotice({ flags }: { flags: SpoilerFlag[] }) {
	return (
		<div className="mb-4 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3">
			<div className="flex items-start gap-2">
				<Warning
					size={18}
					className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
				/>
				<div className="text-sm text-amber-800 dark:text-amber-200">
					<p className="font-semibold mb-1">
						{flags.length} line{plural(flags.length)} may contain GM-only
						knowledge
					</p>
					<p className="mb-2 text-amber-700 dark:text-amber-300">
						Nothing was removed — check these read the way you want players to
						see them.
					</p>
					<ul className="space-y-1">
						{flags.map((flag) => (
							<li key={`${flag.section}-${flag.index}`}>
								<span className="opacity-70">
									{SECTION_LABELS[flag.section] ?? flag.section}:
								</span>{" "}
								{flag.text}{" "}
								<span className="opacity-70">(matched “{flag.match}”)</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

/** Who is about to be mailed, and who was left out and why. */
function RecipientSummary({
	eligible,
	excluded,
}: {
	eligible: PlayerRecapRecipient[];
	excluded: PlayerRecapRecipient[];
}) {
	return (
		<div className="mb-4 rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
			<p className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">
				{eligible.length} player{plural(eligible.length)} will receive this
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
	);
}

/** Subject + markdown body editors, with a live preview of what players get. */
function RecapEditor({
	subject,
	body,
	disabled,
	onSubjectChange,
	onBodyChange,
}: {
	subject: string;
	body: string;
	disabled: boolean;
	onSubjectChange: (value: string) => void;
	onBodyChange: (value: string) => void;
}) {
	return (
		<>
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
				disabled={disabled}
				onChange={(e) => onSubjectChange(e.target.value)}
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
				disabled={disabled}
				onChange={(e) => onBodyChange(e.target.value)}
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
		</>
	);
}

/**
 * Save + two-stage send. Everything else in the app is undoable; mailing the
 * party is not, so "Send recap" arms a confirm button rather than sending.
 */
function DraftActions({
	recap,
	dirty,
	loading,
	eligibleCount,
	confirming,
	onSave,
	onArm,
	onSend,
}: {
	recap: PlayerRecapEmail | undefined;
	dirty: boolean;
	loading: boolean;
	eligibleCount: number;
	confirming: boolean;
	onSave: () => void;
	onArm: () => void;
	onSend: () => void;
}) {
	return (
		<>
			<Button
				appearance="form"
				variant="secondary"
				loading={loading}
				disabled={!recap || !dirty}
				onClick={onSave}
			>
				Save draft
			</Button>

			{confirming ? (
				<Button
					appearance="form"
					variant="destructive"
					loading={loading}
					onClick={onSend}
				>
					Confirm — send to {eligibleCount} player{plural(eligibleCount)}
				</Button>
			) : (
				<Button
					appearance="form"
					variant="primary"
					disabled={loading || !recap || eligibleCount === 0}
					onClick={onArm}
				>
					Send recap
				</Button>
			)}
		</>
	);
}

/**
 * Everything the review modal knows: draft fetching, the editable copies of
 * subject and body, and the derived flags the markup reads. Kept apart from the
 * markup so neither half has to be read to understand the other.
 */
function useRecapReview(
	isOpen: boolean,
	campaignId: string,
	digest: SessionDigestWithData | null
) {
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

	const recap = draft?.recap;
	const isSent = recap?.status === "sent";
	const spoilerFlags = draft?.spoilerFlags ?? [];
	const dirty =
		recap != null && (subject !== recap.subject || body !== recap.bodyMarkdown);

	const persistDraft = (recapId: string) =>
		saveDraft(campaignId, recapId, { subject, bodyMarkdown: body });

	const handleSend = async () => {
		if (!recap) return;

		// Persist pending edits first: what gets mailed is what the GM sees.
		if (dirty && !(await persistDraft(recap.id))) return;

		const result = await sendRecap(campaignId, recap.id);
		if (!result) return;

		setConfirming(false);
		setSendSummary(
			`Sent to ${result.sent} player${plural(result.sent)}` +
				(result.failed > 0 ? `, ${result.failed} failed` : "") +
				(result.skipped > 0 ? `, ${result.skipped} skipped` : "")
		);
	};

	return {
		loading,
		error,
		recap,
		isSent,
		spoilerFlags,
		eligible,
		excluded,
		subject,
		setSubject,
		body,
		setBody,
		dirty,
		confirming,
		armSend: () => setConfirming(true),
		sendSummary,
		persistDraft,
		handleSend,
	};
}

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
		loading,
		error,
		recap,
		isSent,
		spoilerFlags,
		eligible,
		excluded,
		subject,
		setSubject,
		body,
		setBody,
		dirty,
		confirming,
		armSend,
		sendSummary,
		persistDraft,
		handleSend,
	} = useRecapReview(isOpen, campaignId, digest);

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
					<SpoilerNotice flags={spoilerFlags} />
				)}

				<RecipientSummary eligible={eligible} excluded={excluded} />

				<RecapEditor
					subject={subject}
					body={body}
					disabled={isSent}
					onSubjectChange={setSubject}
					onBodyChange={setBody}
				/>

				<div className="flex flex-col sm:flex-row sm:justify-end gap-2">
					<Button appearance="form" variant="secondary" onClick={onClose}>
						{isSent ? "Close" : "Cancel"}
					</Button>

					{!isSent && (
						<DraftActions
							recap={recap}
							dirty={dirty}
							loading={loading}
							eligibleCount={eligible.length}
							confirming={confirming}
							onSave={() => {
								if (recap) void persistDraft(recap.id);
							}}
							onArm={armSend}
							onSend={handleSend}
						/>
					)}
				</div>
			</div>
		</Modal>
	);
}
