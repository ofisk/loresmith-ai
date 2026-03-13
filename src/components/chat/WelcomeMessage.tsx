import addToLibraryIcon from "@/assets/add-to-library.png";
import campaignIcon from "@/assets/campaign.png";
import mapIcon from "@/assets/map.png";
import { Card } from "@/components/card/Card";

interface WelcomeMessageProps {
	onSuggestionSubmit: (suggestion: string) => void;
	onUploadFiles?: () => void;
	/** When true, shows "Create your first campaign" as the primary CTA */
	hasNoCampaigns?: boolean;
	/** Opens the create campaign modal; used when hasNoCampaigns is true */
	onCreateCampaign?: () => void;
}

export function WelcomeMessage({
	onSuggestionSubmit,
	onUploadFiles,
	hasNoCampaigns,
	onCreateCampaign,
}: WelcomeMessageProps) {
	return (
		<div className="w-full flex justify-center py-8">
			<Card className="p-8 max-w-4xl w-full bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
				<div className="text-left space-y-6">
					<h3 className="font-semibold text-xl">
						Welcome to LoreSmith campaign planner!
					</h3>
					<div className="text-muted-foreground text-base space-y-4">
						<p>Choose your path to begin your campaign journey:</p>

						<div className="space-y-3">
							<div>
								<div className="font-semibold text-base mb-2 flex items-center gap-2">
									<span className="bg-neutral-200 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md text-sm">
										Build your campaign library
									</span>
								</div>
								<p className="text-sm mt-1">
									Upload adventure modules, homebrew content, maps, and
									reference materials. LoreSmith transforms your PDFs and
									documents into an intelligent, searchable knowledge base that
									helps you find exactly what you need when planning sessions.
								</p>
							</div>

							<div>
								<div className="font-semibold text-base mb-2 flex items-center gap-2">
									<span className="bg-neutral-200 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md text-sm">
										Organize your story
									</span>
								</div>
								<p className="text-sm mt-1">
									Create campaigns to organize your narrative, track NPCs,
									manage plot hooks, and build your world. Keep all your
									campaign context in one place and accessible at a moment's
									notice.
								</p>
							</div>

							<div>
								<div className="font-semibold text-base mb-2 flex items-center gap-2">
									<span className="bg-neutral-200 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md text-sm">
										Start brainstorming
									</span>
								</div>
								<p className="text-sm mt-1">
									Not sure where to begin? Chat with me! I can help you develop
									campaign ideas, create compelling NPCs, design encounters,
									plan sessions, and answer questions about game mechanics.
									Think of me as your always-available co-GM.
								</p>
							</div>
						</div>

						<p className="font-medium bg-neutral-200 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700">
							{hasNoCampaigns
								? "Start by creating a campaign to organize your story."
								: "Ready to dive in? Pick an option below to get started:"}
						</p>
					</div>
					<div className="flex gap-4 flex-wrap">
						{hasNoCampaigns && onCreateCampaign && (
							<button
								type="button"
								aria-label="Create your first campaign"
								className="flex-1 min-w-[200px] bg-white dark:bg-neutral-800 p-5 rounded-xl border-2 border-blue-500/50 dark:border-blue-400/50 backdrop-blur-sm shadow-lg hover:shadow-xl hover:scale-[1.02] hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 cursor-pointer text-left ring-2 ring-blue-500/20 dark:ring-blue-400/20"
								onClick={onCreateCampaign}
							>
								<h4 className="font-semibold text-base mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-300">
									<img
										src={campaignIcon}
										alt="Campaign"
										className="w-12 h-12"
										width={48}
										height={48}
									/>
									Create your first campaign
								</h4>
								<p className="text-sm text-muted-foreground">
									Create a campaign to organize your narrative, track NPCs, and
									build your world
								</p>
							</button>
						)}
						<button
							type="button"
							aria-label="Build your library"
							className="flex-1 min-w-[200px] bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm hover:shadow-md hover:scale-[1.02] hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 cursor-pointer text-left"
							onClick={onUploadFiles}
						>
							<h4 className="font-medium text-base mb-2 flex items-center gap-2">
								<img
									src={addToLibraryIcon}
									alt="Add to Library"
									className="w-12 h-12"
									width={48}
									height={48}
								/>
								Build your library
							</h4>
							<p className="text-sm text-muted-foreground">
								Upload maps, adventure modules, campaign primers, and notes to
								build a searchable knowledge base
							</p>
						</button>
						<button
							type="button"
							aria-label="Plan your campaign"
							className="flex-1 bg-white/80 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-sm shadow-sm hover:shadow-md hover:scale-[1.02] hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 cursor-pointer text-left"
							onClick={() => onSuggestionSubmit("Help me plan a new campaign")}
						>
							<h4 className="font-medium text-base mb-2 flex items-center gap-2">
								<img
									src={mapIcon}
									alt="Map"
									className="w-12 h-12"
									width={48}
									height={48}
								/>
								Plan your campaign
							</h4>
							<p className="text-sm text-muted-foreground">
								Chat with me to brainstorm ideas, create campaigns, and plan
								adventures
							</p>
						</button>
					</div>
				</div>
			</Card>
		</div>
	);
}
