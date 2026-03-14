import { PaperPlaneRight, Stop } from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	type PlayerCharacterOption,
	PlayerCharacterSelectionModal,
} from "@/components/campaign/PlayerCharacterSelectionModal";
import { Card } from "@/components/card/Card";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { WelcomeMessage } from "@/components/chat/WelcomeMessage";
import { ChatInput } from "@/components/input/ChatInput";
import { ThinkingSpinner } from "@/components/thinking-spinner";
import { CAMPAIGN_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";
import { AuthService } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { Message } from "@/types/ai-message";
import type { Campaign } from "@/types/campaign";

const CHAT_PROMPTS = [
	"Need some lore?",
	"Consult the archives?",
	"What's on your mind?",
	"What can I help with?",
];

const getRandomPrompt = () =>
	CHAT_PROMPTS[Math.floor(Math.random() * CHAT_PROMPTS.length)];

interface ChatAreaProps {
	chatContainerId: string;
	messages: Message[];
	/** True while persisted chat history is being loaded (e.g. on page load). */
	chatHistoryLoading?: boolean;
	input: string;
	onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	onFormSubmit: (e: React.FormEvent) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	isLoading: boolean;
	onStop: () => void;
	formatTime: (date: Date) => string;
	onSuggestionSubmit: (suggestion: string) => void;
	onUploadFiles: () => void;
	textareaHeight: string;
	pendingToolCallConfirmation: boolean;
	campaigns: Campaign[];
	selectedCampaignId: string | null;
	onSelectedCampaignChange: (campaignId: string | null) => void;
	/** Opens the create campaign modal; used in welcome message when no campaigns exist */
	onCreateCampaign?: () => void;
	/** User message contents to hide (e.g. button-triggered prompts). */
	invisibleUserContents?: Set<string>;
	/** Live status from agent (e.g. "Searching campaign...") for thinking spinner */
	agentStatus?: string | null;
}

/**
 * ChatArea component - Main chat interface with messages, campaign context, and input
 */
export function ChatArea({
	chatContainerId,
	messages,
	chatHistoryLoading = false,
	input,
	onInputChange,
	onFormSubmit,
	onKeyDown,
	isLoading,
	onStop,
	formatTime,
	onSuggestionSubmit,
	onUploadFiles,
	textareaHeight,
	pendingToolCallConfirmation,
	campaigns,
	selectedCampaignId,
	onSelectedCampaignChange,
	onCreateCampaign,
	invisibleUserContents,
	agentStatus,
}: ChatAreaProps) {
	const [placeholder] = useState(() => getRandomPrompt());
	const [claimOptions, setClaimOptions] = useState<PlayerCharacterOption[]>([]);
	const [showCharacterClaimModal, setShowCharacterClaimModal] = useState(false);
	const [isSubmittingCharacterClaim, setIsSubmittingCharacterClaim] =
		useState(false);
	const [characterClaimError, setCharacterClaimError] = useState<string | null>(
		null
	);

	const selectedCampaign = useMemo(
		() =>
			selectedCampaignId
				? (campaigns.find(
						(campaign) => campaign.campaignId === selectedCampaignId
					) ?? null)
				: null,
		[campaigns, selectedCampaignId]
	);

	useEffect(() => {
		const campaignId = selectedCampaign?.campaignId;
		const role = selectedCampaign?.role ?? null;
		if (!campaignId || !role || !PLAYER_ROLES.has(role)) {
			setShowCharacterClaimModal(false);
			setClaimOptions([]);
			setCharacterClaimError(null);
			return;
		}

		const jwt = AuthService.getStoredJwt();
		if (!jwt) {
			setShowCharacterClaimModal(false);
			setClaimOptions([]);
			return;
		}

		let cancelled = false;

		const fetchCharacterClaimOptions = async () => {
			try {
				setCharacterClaimError(null);
				const response = await fetch(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_OPTIONS(
							campaignId
						)
					),
					{
						headers: {
							Authorization: `Bearer ${jwt}`,
						},
					}
				);

				const data = (await response.json()) as {
					requiresCharacterSelection?: boolean;
					options?: PlayerCharacterOption[];
					currentClaim?: unknown;
					error?: string;
				};

				if (cancelled) return;

				if (!response.ok) {
					throw new Error(data.error ?? "Failed to load player characters");
				}

				const hasCurrentClaim = !!data.currentClaim;
				const hasAvailableClaimOptions = (data.options?.length ?? 0) > 0;
				const shouldPromptReadonlyPlayer =
					role === CAMPAIGN_ROLES.READONLY_PLAYER &&
					!hasCurrentClaim &&
					hasAvailableClaimOptions;
				if (data.requiresCharacterSelection || shouldPromptReadonlyPlayer) {
					setClaimOptions(data.options ?? []);
					setShowCharacterClaimModal(true);
					return;
				}

				setShowCharacterClaimModal(false);
				setClaimOptions([]);
			} catch (error) {
				if (cancelled) return;
				setCharacterClaimError(
					error instanceof Error
						? error.message
						: "Failed to load player characters"
				);
				setClaimOptions([]);
				setShowCharacterClaimModal(true);
			}
		};

		fetchCharacterClaimOptions();

		return () => {
			cancelled = true;
		};
	}, [selectedCampaign]);

	const handleSubmitPlayerCharacterClaim = async (entityId: string) => {
		const campaignId = selectedCampaign?.campaignId;
		const jwt = AuthService.getStoredJwt();
		if (!campaignId || !jwt) {
			setCharacterClaimError("Authentication required");
			return;
		}

		setCharacterClaimError(null);
		setIsSubmittingCharacterClaim(true);

		try {
			const response = await fetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM(campaignId)
				),
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ entityId }),
				}
			);
			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to save player character claim");
			}
			setShowCharacterClaimModal(false);
			setClaimOptions([]);
			setCharacterClaimError(null);
		} catch (error) {
			setCharacterClaimError(
				error instanceof Error
					? error.message
					: "Failed to save player character claim"
			);
		} finally {
			setIsSubmittingCharacterClaim(false);
		}
	};

	const handleCampaignChange = (
		event: React.ChangeEvent<HTMLSelectElement>
	) => {
		const value = event.target.value;
		if (!value) {
			onSelectedCampaignChange(null);
		} else {
			onSelectedCampaignChange(value);
		}
	};

	return (
		<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">
			{/* Campaign Context Selector - at top of chat pane */}
			<div className="px-4 md:px-8 py-2 md:py-3 flex-shrink-0">
				<select
					id="campaign-select"
					className="tour-campaign-selector w-full sm:w-auto rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-neutral-500"
					value={selectedCampaignId ?? ""}
					onChange={handleCampaignChange}
				>
					<option value="">No campaign selected</option>
					{campaigns.map((campaign) => (
						<option key={campaign.campaignId} value={campaign.campaignId}>
							{campaign.name}
						</option>
					))}
				</select>
			</div>

			{/* Main Content Area - stretches down to input, scrolls when content overflows */}
			<div
				id={chatContainerId}
				className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-4 md:py-6 space-y-6 pb-8 md:pb-12"
			>
				{messages.length === 0 && !chatHistoryLoading && (
					<WelcomeMessage
						onSuggestionSubmit={onSuggestionSubmit}
						onUploadFiles={onUploadFiles}
						hasNoCampaigns={campaigns.length === 0}
						onCreateCampaign={onCreateCampaign}
					/>
				)}
				{messages.length === 0 && chatHistoryLoading && (
					<div className="flex items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
						Loading conversation...
					</div>
				)}

				<ChatMessageList
					messages={messages}
					formatTime={formatTime}
					invisibleUserContents={invisibleUserContents}
				/>

				{/* Thinking Spinner - shown when agent is processing */}
				{isLoading && (
					<div className="flex justify-start">
						<div className="w-full">
							<Card className="p-4 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-bl-none border-assistant-border shadow-sm border border-neutral-200/50 dark:border-neutral-700/50">
								<ThinkingSpinner status={agentStatus} />
							</Card>
						</div>
					</div>
				)}
			</div>

			{/* Input Area - at bottom, grows upward over chat as user types */}
			<form
				onSubmit={onFormSubmit}
				className="chat-input-area flex-shrink-0 px-3 md:px-4 pt-2 md:pt-3 pb-4 md:pb-8 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-sm rounded-br-2xl"
			>
				<div className="flex items-center gap-2">
					<div className="flex-1 min-w-0 relative">
						<ChatInput
							disabled={pendingToolCallConfirmation}
							placeholder={
								pendingToolCallConfirmation
									? "Please respond to the tool confirmation above..."
									: placeholder
							}
							className="flex w-full border border-neutral-200/50 dark:border-neutral-700/50 px-3 py-2 text-base placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[var(--height-input-min)] max-h-[var(--height-input-max)] overflow-y-auto overflow-x-hidden break-words resize-none rounded-2xl !text-base pb-10 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm"
							value={input}
							onChange={
								onInputChange as unknown as React.ChangeEventHandler<HTMLInputElement>
							}
							onKeyDown={onKeyDown}
							multiline
							rows={1}
							style={{ height: textareaHeight }}
						/>
						<div className="absolute bottom-1 right-1 p-1.5 w-fit flex flex-row justify-end">
							{isLoading ? (
								<button
									type="button"
									onClick={onStop}
									className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
									aria-label="Stop generation"
								>
									<Stop size={16} />
								</button>
							) : (
								<button
									type="submit"
									className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
									disabled={
										pendingToolCallConfirmation || !(input ?? "").trim()
									}
									aria-label="Send message"
								>
									<PaperPlaneRight size={16} />
								</button>
							)}
						</div>
					</div>
				</div>
			</form>

			<PlayerCharacterSelectionModal
				isOpen={showCharacterClaimModal}
				campaignName={selectedCampaign?.name}
				options={claimOptions}
				isSubmitting={isSubmittingCharacterClaim}
				error={characterClaimError}
				allowSkip={selectedCampaign?.role === CAMPAIGN_ROLES.READONLY_PLAYER}
				onSkip={() => setShowCharacterClaimModal(false)}
				onSubmit={handleSubmitPlayerCharacterClaim}
			/>
		</div>
	);
}
