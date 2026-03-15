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
	/** When provided, "Work on this" buttons are shown for parsed next steps; called with the step label. */
	onWorkOnNextStep?: (stepLabel: string) => void;
}

const NEXT_STEP_HEADING = /next step/i;
const LIST_ITEM_START = /^\s*[-*]\s+|^\s*\d+\.\s+/;

/**
 * Parses assistant message text for a "next steps" section and returns labels for each list item.
 * Tolerant of wording like "Your open next steps" or "Next steps:".
 */
function parseNextStepLabels(text: string): string[] {
	const normalized = text.replace(/^scheduled message: /, "").trim();
	const lines = normalized.split("\n");
	const headingIndex = lines.findIndex((line) => NEXT_STEP_HEADING.test(line));
	if (headingIndex < 0) return [];

	const labels: string[] = [];
	for (let i = headingIndex + 1; i < lines.length; i++) {
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
																	<MemoizedMarkdown
																		content={part.text.replace(
																			/^scheduled message: /,
																			""
																		)}
																	/>
																</Card>
																{!isUser &&
																	onWorkOnNextStep &&
																	(() => {
																		const stepLabels = parseNextStepLabels(
																			part.text
																		);
																		if (stepLabels.length === 0) return null;
																		return (
																			<div className="mt-2 flex flex-wrap gap-2">
																				{stepLabels.map((label) => (
																					<button
																						key={label}
																						type="button"
																						onClick={() =>
																							onWorkOnNextStep(label)
																						}
																						className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900 transition-colors"
																						aria-label={`Work on this step: ${label}`}
																					>
																						Work on this
																					</button>
																				))}
																			</div>
																		);
																	})()}
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
