import { CaretRight } from "@phosphor-icons/react";
import { Card } from "@/components/card/Card";
import { CopyAsMarkdownButton } from "@/components/chat/CopyAsMarkdownButton";
import { ExplainabilitySection } from "@/components/chat/ExplainabilitySection";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";
import type { Message } from "@/types/ai-message";

interface ChatMessageListProps {
	messages: Message[];
	formatTime: (date: Date) => string;
	/** User message contents to hide (e.g. button-triggered prompts). */
	invisibleUserContents?: Set<string>;
	/** When provided, "Work on this" buttons are shown for next steps in agent messages; called with the step label. */
	onWorkOnNextStep?: (stepLabel: string) => void;
	/** When provided, used as the list of step labels for buttons (from planning-tasks API). Message text is still used as a hint for whether to show buttons. */
	openPlanningTaskTitles?: string[];
}

/**
 * Next-step buttons can be driven in two ways (see plan/docs):
 * 1. Programmatic: pass openPlanningTaskTitles from the planning-tasks API; we use message text only as a hint
 *    ("next step" / "open task") for whether to show buttons. Single source of truth, no markdown parsing.
 * 2. Fallback: when no API list is provided, parse message text for a "next steps" / "open tasks" heading
 *    and following list items. Works but is brittle to model wording.
 * Alternative patterns: (A) backend attaches message.data.openPlanningTaskTitles when storing the reply;
 * (B) model outputs a structured block (e.g. <next-steps>...</next-steps>) for reliable parsing.
 */
/** Matches a line that introduces a list of next steps or open tasks (e.g. "Your open next steps:", "You still have two open tasks:"). */
const NEXT_STEP_HEADING = /(?:next step|open task)/i;
const LIST_ITEM_START = /^\s*[-*]\s+|^\s*\d+\.\s+/;

/**
 * Returns true if the message text suggests this message is presenting next steps / open tasks
 * (so we should show "Work on this" buttons when we have a list from API or parser).
 */
function messageSuggestsNextSteps(text: string): boolean {
	const normalized = text.replace(/^scheduled message: /, "").trim();
	return NEXT_STEP_HEADING.test(normalized);
}

/**
 * Parses assistant message text for a "next steps" / "open tasks" section and returns labels for each list item.
 * Used only when openPlanningTaskTitles is not provided (fallback). Tolerant of wording like "Your open next steps", "Next steps:", or "You still have two open tasks:".
 */
function parseNextStepLabels(text: string): string[] {
	const normalized = text.replace(/^scheduled message: /, "").trim();
	const lines = normalized.split("\n");
	const headingIndex = lines.findIndex((line) => NEXT_STEP_HEADING.test(line));
	if (headingIndex < 0) return [];

	const labels: string[] = [];
	let i = headingIndex + 1;
	// Skip blank lines after the heading (e.g. "You still have two open tasks:\n\n- Item")
	while (i < lines.length && lines[i].trim() === "") i++;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "") break;
		if (!LIST_ITEM_START.test(line)) break;
		const withoutPrefix = line.replace(LIST_ITEM_START, "").trim();
		const withoutBold = withoutPrefix.replace(/\*\*/g, "").trim();
		const label = withoutBold.includes(" - ")
			? withoutBold.split(" - ")[0].trim()
			: withoutBold;
		if (label.length > 0) labels.push(label.slice(0, 200));
	}
	return labels;
}

export interface NextStepsSegments {
	beforeList: string;
	listItemLines: string[];
	afterList: string;
}

/**
 * Splits message text into before-list, list item lines, and after-list so we can render a "Work on this" button next to each list item.
 */
function parseNextStepsSegments(text: string): NextStepsSegments | null {
	const normalized = text.replace(/^scheduled message: /, "").trim();
	const lines = normalized.split("\n");
	const headingIndex = lines.findIndex((line) => NEXT_STEP_HEADING.test(line));
	if (headingIndex < 0) return null;

	let i = headingIndex + 1;
	while (i < lines.length && lines[i].trim() === "") i++;
	const listStart = i;
	while (
		i < lines.length &&
		lines[i].trim() !== "" &&
		LIST_ITEM_START.test(lines[i])
	)
		i++;
	const listEnd = i;
	const listItemLines = lines.slice(listStart, listEnd).filter((l) => l.trim());
	if (listItemLines.length === 0) return null;

	const beforeList = lines.slice(0, listStart).join("\n").trim();
	const afterList = lines.slice(listEnd).join("\n").trim();
	return { beforeList, listItemLines, afterList };
}

function getMessageText(m: Message): string {
	const parts = m.parts ?? [];
	if (parts.length > 0) {
		const textPart = parts.find(
			(p) => p.type === "text" && typeof p.text === "string"
		);
		if (textPart && "text" in textPart) return (textPart.text ?? "").trim();
	}
	return (m.content ?? "").trim();
}

function hasVisibleContent(m: Message): boolean {
	const parts = m.parts ?? [];
	if (parts.length === 0) return false;
	const hasText = parts.some(
		(p) =>
			p.type === "text" && typeof p.text === "string" && p.text.trim() !== ""
	);
	return hasText;
}

export function ChatMessageList({
	messages,
	formatTime,
	invisibleUserContents,
	onWorkOnNextStep,
	openPlanningTaskTitles,
}: ChatMessageListProps) {
	return (
		<>
			{messages
				.filter((m: Message) => {
					if (m.role === "system") return false;
					if (m.role === "user" && m.content === "Get started") return false;
					if (
						m.role === "user" &&
						invisibleUserContents?.has(getMessageText(m))
					)
						return false;
					if (!hasVisibleContent(m)) return false;
					return true;
				})
				.map((m: Message, _index) => {
					const isUser = m.role === "user";

					return (
						<div key={m.id}>
							<div
								className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`min-w-0 ${isUser ? "flex flex-row-reverse gap-2 max-w-[85%]" : "w-full"}`}
								>
									<div className={`min-w-0 ${isUser ? "flex-1" : "w-full"}`}>
										<div>
											{(() => {
												// Find the index of the last text part in the original parts array
												const parts = m.parts || [];
												let lastTextPartIndex = -1;
												for (let j = parts.length - 1; j >= 0; j--) {
													if (parts[j]?.type === "text") {
														lastTextPartIndex = j;
														break;
													}
												}

												return parts.map((part, i) => {
													const hasTopLevelRender = false;
													if (part.type === "text" && hasTopLevelRender) {
														return null;
													}
													if (
														part.type === "text" &&
														typeof part.text === "string" &&
														part.text.trim() !== ""
													) {
														const isLastTextPart = i === lastTextPartIndex;
														const occurrenceIndex = parts
															.slice(0, i + 1)
															.filter(
																(p) =>
																	p.type === "text" &&
																	typeof p.text === "string" &&
																	p.text === part.text
															).length;
														const partKey = `${m.id}-text-${part.text}-n${occurrenceIndex}`;

														return (
															<div key={partKey} className="min-w-0">
																<Card
																	className={`p-4 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm min-w-0 ${
																		isUser
																			? "rounded-br-none"
																			: "rounded-bl-none border-assistant-border"
																	} ${
																		part.text.startsWith("scheduled message")
																			? "border-accent/50"
																			: ""
																	} relative shadow-sm border border-neutral-200/50 dark:border-neutral-700/50`}
																>
																	{part.text.startsWith(
																		"scheduled message"
																	) && (
																		<span
																			className="absolute -top-3 -left-2 text-base"
																			aria-hidden="true"
																		>
																			🕒
																		</span>
																	)}
																	{!isUser && (
																		<CopyAsMarkdownButton
																			markdown={part.text.replace(
																				/^scheduled message: /,
																				""
																			)}
																		/>
																	)}
																	{!isUser &&
																		onWorkOnNextStep &&
																		messageSuggestsNextSteps(part.text) &&
																		(() => {
																			const stepLabels =
																				openPlanningTaskTitles &&
																				openPlanningTaskTitles.length > 0
																					? openPlanningTaskTitles
																					: parseNextStepLabels(part.text);
																			const segments = parseNextStepsSegments(
																				part.text
																			);
																			if (
																				stepLabels.length === 0 &&
																				(!segments ||
																					segments.listItemLines.length === 0)
																			)
																				return (
																					<MemoizedMarkdown
																						content={part.text.replace(
																							/^scheduled message: /,
																							""
																						)}
																					/>
																				);
																			// Render with "Work on this" next to each list item
																			if (
																				segments &&
																				segments.listItemLines.length > 0
																			) {
																				const labels =
																					stepLabels.length >=
																					segments.listItemLines.length
																						? stepLabels
																						: [
																								...stepLabels,
																								...parseNextStepLabels(
																									part.text
																								).slice(stepLabels.length),
																							];
																				return (
																					<>
																						{segments.beforeList && (
																							<MemoizedMarkdown
																								content={segments.beforeList}
																							/>
																						)}
																						<ul className="list-disc pl-5 my-2 space-y-1.5">
																							{segments.listItemLines.map(
																								(line, i) => {
																									const label =
																										labels[i] ??
																										line
																											.replace(
																												LIST_ITEM_START,
																												""
																											)
																											.replace(/\*\*/g, "")
																											.trim()
																											.split(" - ")[0]
																											?.trim() ??
																										line;
																									return (
																										<li
																											key={`${i}-${label.slice(0, 40)}`}
																											className="flex items-center gap-1.5 [&>span]:min-w-0 [&>span]:flex-1"
																										>
																											<span>
																												<MemoizedMarkdown
																													content={line}
																												/>
																											</span>
																											<button
																												type="button"
																												onClick={() =>
																													onWorkOnNextStep(
																														label
																													)
																												}
																												className="shrink-0 inline-flex items-center justify-center rounded p-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900 transition-colors"
																												aria-label={`Work on this step: ${label}`}
																												title="Work on this"
																											>
																												<CaretRight
																													size={16}
																													weight="bold"
																													aria-hidden
																												/>
																											</button>
																										</li>
																									);
																								}
																							)}
																						</ul>
																						{segments.afterList && (
																							<MemoizedMarkdown
																								content={segments.afterList}
																							/>
																						)}
																					</>
																				);
																			}
																			// Fallback: single block + buttons below
																			return (
																				<>
																					<MemoizedMarkdown
																						content={part.text.replace(
																							/^scheduled message: /,
																							""
																						)}
																					/>
																					<div className="mt-2 flex flex-wrap gap-1.5">
																						{stepLabels.map((label) => (
																							<button
																								key={label}
																								type="button"
																								onClick={() =>
																									onWorkOnNextStep(label)
																								}
																								className="shrink-0 inline-flex items-center justify-center rounded p-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900 transition-colors"
																								aria-label={`Work on this step: ${label}`}
																								title="Work on this"
																							>
																								<CaretRight
																									size={16}
																									weight="bold"
																									aria-hidden
																								/>
																							</button>
																						))}
																					</div>
																				</>
																			);
																		})()}
																	{(!onWorkOnNextStep ||
																		!messageSuggestsNextSteps(part.text)) && (
																		<MemoizedMarkdown
																			content={part.text.replace(
																				/^scheduled message: /,
																				""
																			)}
																		/>
																	)}
																</Card>
																{isLastTextPart &&
																	!isUser &&
																	m.data?.explainability &&
																	m.data.explainability.contextSources?.length >
																		0 && (
																		<ExplainabilitySection
																			explainability={m.data.explainability}
																			collapsedByDefault
																		/>
																	)}
																{isLastTextPart &&
																	(() => {
																		const createdAt = m.createdAt as
																			| string
																			| Date
																			| undefined;
																		const date =
																			createdAt != null
																				? new Date(createdAt)
																				: null;
																		const isValid =
																			date != null &&
																			!Number.isNaN(date.getTime());
																		return isValid ? (
																			<p
																				className={`text-xs text-muted-foreground mt-2 px-1 ${
																					isUser ? "text-right" : "text-left"
																				}`}
																			>
																				{formatTime(date)}
																			</p>
																		) : null;
																	})()}
															</div>
														);
													}

													return null;
												});
											})()}
										</div>
									</div>
								</div>
							</div>
						</div>
					);
				})}
		</>
	);
}
