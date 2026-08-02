import {
	ArrowRight,
	CaretDown,
	CaretRight,
	Lightning,
	MagnifyingGlass,
	PencilSimple,
	Warning,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Card } from "@/components/card/Card";
import { openSourceEntity } from "@/lib/source-navigation";
import { cn } from "@/lib/utils";
import type {
	ToolEffect,
	ToolReceipt,
	ToolReceipts,
} from "@/types/tool-receipt";

interface ToolReceiptsSectionProps {
	receipts: ToolReceipts;
	/** Needed to deep-link an entity a call touched. */
	campaignId?: string | null;
	collapsedByDefault?: boolean;
}

/** Tool names listed in the collapsed header before it says "and N more". */
const HEADER_TOOL_NAMES = 4;

const EFFECT_ICON: Record<
	ToolEffect,
	typeof MagnifyingGlass | typeof PencilSimple | typeof Lightning
> = {
	read: MagnifyingGlass,
	write: PencilSimple,
	action: Lightning,
};

const EFFECT_LABEL: Record<ToolEffect, string> = {
	read: "Read only",
	write: "Changed your campaign",
	action: "Ran an action",
};

/**
 * Writes carry a filled accent rail and a pencil; reads stay flat and grey.
 * The point of the whole component is that "did it change anything?" is
 * answerable at a glance, so the two must not look alike.
 */
const EFFECT_ROW_CLASS: Record<ToolEffect, string> = {
	read: "border-l-2 border-l-transparent",
	write: "border-l-2 border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20",
	action: "border-l-2 border-l-neutral-300 dark:border-l-neutral-600",
};

const EFFECT_ICON_CLASS: Record<ToolEffect, string> = {
	read: "text-neutral-400 dark:text-neutral-500",
	write: "text-violet-600 dark:text-violet-400",
	action: "text-neutral-500 dark:text-neutral-400",
};

function EntityLinks({
	receipt,
	campaignId,
}: {
	receipt: ToolReceipt;
	campaignId?: string | null;
}) {
	const entities = receipt.entities ?? [];
	if (entities.length === 0 || !campaignId) return null;

	return (
		<span className="flex flex-wrap items-center gap-1">
			{entities.map((entity) => (
				<button
					key={entity.id}
					type="button"
					onClick={() =>
						openSourceEntity({
							campaignId,
							entityId: entity.id,
							entityName: entity.name,
						})
					}
					className="cursor-pointer rounded px-1 text-neutral-700 underline decoration-dotted underline-offset-2 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-50"
					aria-label={`Open ${entity.name}`}
					title={`Open ${entity.name}`}
				>
					{entity.name}
				</button>
			))}
		</span>
	);
}

/**
 * The detail is usually the entity's own name. Once it renders as a link,
 * showing it twice reads as two separate things the tool touched.
 */
function shouldShowDetail(receipt: ToolReceipt, hasEntityLinks: boolean) {
	if (!receipt.detail) return false;
	if (!hasEntityLinks) return true;
	const detail = receipt.detail.toLowerCase();
	return !receipt.entities?.some((e) => e.name.toLowerCase() === detail);
}

function ReceiptOutcome({
	outcome,
	failed,
}: {
	outcome: string;
	failed: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-baseline gap-1",
				failed
					? "text-red-700 dark:text-red-300"
					: "text-neutral-600 dark:text-neutral-300"
			)}
		>
			<ArrowRight
				size={11}
				aria-hidden
				className="translate-y-px text-neutral-400 dark:text-neutral-500"
			/>
			{outcome}
		</span>
	);
}

function ReceiptRow({
	receipt,
	campaignId,
}: {
	receipt: ToolReceipt;
	campaignId?: string | null;
}) {
	const failed = receipt.status === "error";
	const Icon = failed ? Warning : EFFECT_ICON[receipt.effect];
	const hasEntityLinks = (receipt.entities?.length ?? 0) > 0 && !!campaignId;
	const showDetail = shouldShowDetail(receipt, hasEntityLinks);
	const attempts = receipt.attempts ?? 1;

	return (
		<li
			className={cn(
				"flex items-start gap-2 rounded-r-md py-1 pl-2 pr-1 text-sm",
				failed
					? "border-l-2 border-l-red-500 bg-red-50/60 dark:bg-red-950/20"
					: EFFECT_ROW_CLASS[receipt.effect]
			)}
		>
			<Icon
				size={14}
				weight={failed ? "fill" : "regular"}
				aria-hidden
				className={cn(
					"mt-0.5 flex-shrink-0",
					failed
						? "text-red-600 dark:text-red-400"
						: EFFECT_ICON_CLASS[receipt.effect]
				)}
			/>
			<span className="sr-only">
				{failed ? "Failed" : EFFECT_LABEL[receipt.effect]}:{" "}
			</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span
					className="font-medium text-neutral-700 dark:text-neutral-200"
					title={receipt.toolName}
				>
					{receipt.label}
				</span>
				{showDetail && (
					<span className="min-w-0 truncate text-neutral-500 dark:text-neutral-400">
						{receipt.detail}
					</span>
				)}
				{hasEntityLinks && (
					<EntityLinks receipt={receipt} campaignId={campaignId} />
				)}
				{receipt.outcome && (
					<ReceiptOutcome outcome={receipt.outcome} failed={failed} />
				)}
				{attempts > 1 && (
					<span className="text-xs text-amber-700 dark:text-amber-400">
						ran {attempts}×
					</span>
				)}
			</div>
		</li>
	);
}

function ReceiptBadges({ receipts }: { receipts: ToolReceipts }) {
	const { writeCount, errorCount } = receipts;
	return (
		<>
			{writeCount > 0 && (
				<span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
					<PencilSimple size={11} weight="fill" aria-hidden />
					{writeCount} change{writeCount === 1 ? "" : "s"}
				</span>
			)}
			{errorCount > 0 && (
				<span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
					<Warning size={11} weight="fill" aria-hidden />
					{errorCount} failed
				</span>
			)}
		</>
	);
}

/**
 * "What the agent ran" — a collapsed receipt of the tool calls behind one
 * assistant reply.
 *
 * Collapsed by default: the receipt exists so a user *can* check, not so every
 * answer arrives buried under its own audit trail.
 */
export function ToolReceiptsSection({
	receipts,
	campaignId,
	collapsedByDefault = true,
}: ToolReceiptsSectionProps) {
	const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);

	const { calls, totalCallCount } = receipts;
	if (calls.length === 0) return null;

	const shownNames = calls.slice(0, HEADER_TOOL_NAMES).map((c) => c.label);
	const remaining = calls.length - shownNames.length;
	const summary =
		remaining > 0
			? `${shownNames.join(", ")} +${remaining} more`
			: shownNames.join(", ");
	// Rows collapse repeats, so "shown" is the sum of attempts — not the row
	// count — and the remainder is what MAX_RECEIPT_CALLS truncated away.
	const shownCalls = calls.reduce((n, c) => n + (c.attempts ?? 1), 0);
	const hiddenCalls = Math.max(0, totalCallCount - shownCalls);

	return (
		<div className="mt-2">
			<button
				type="button"
				aria-expanded={isExpanded}
				className="w-full cursor-pointer rounded-lg border border-neutral-200/50 p-2 text-left transition-colors hover:bg-neutral-100/50 dark:border-neutral-700/50 dark:hover:bg-neutral-800/50"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex min-w-0 items-center gap-2">
					{isExpanded ? (
						<CaretDown size={14} className="flex-shrink-0 text-neutral-500" />
					) : (
						<CaretRight size={14} className="flex-shrink-0 text-neutral-500" />
					)}
					<span className="flex-shrink-0 text-sm font-medium text-neutral-700 dark:text-neutral-300">
						{totalCallCount} action{totalCallCount === 1 ? "" : "s"}
					</span>
					<ReceiptBadges receipts={receipts} />
					{!isExpanded && (
						<span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
							{summary}
						</span>
					)}
				</div>
			</button>
			{isExpanded && (
				<Card className="mt-1 rounded-lg border border-neutral-200/50 bg-neutral-50/80 p-2 dark:border-neutral-700/50 dark:bg-neutral-900/50">
					<ul className="space-y-0.5">
						{calls.map((call, index) => (
							<ReceiptRow
								key={`${call.toolName}-${call.detail ?? ""}-${call.status}-${index}`}
								receipt={call}
								campaignId={campaignId}
							/>
						))}
					</ul>
					{hiddenCalls > 0 && (
						<p className="mt-2 px-2 text-xs text-neutral-500 dark:text-neutral-400">
							{hiddenCalls} more call{hiddenCalls === 1 ? "" : "s"} not shown.
						</p>
					)}
				</Card>
			)}
		</div>
	);
}
