import { NotePencil } from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";

interface AppHeaderProps {
	onSessionRecapRequest?: () => void;
	selectedCampaignId: string | null;
}

/**
 * AppHeader component - Sidebar header with logo and quick-action controls.
 * Rendered inside ResourceSidePanel so it appears on both the persistent
 * desktop sidebar and the off-canvas mobile sidebar.
 */
export function AppHeader({
	onSessionRecapRequest,
	selectedCampaignId,
}: AppHeaderProps) {
	return (
		<div className="app-header px-4 pt-4 pb-3 border-b border-neutral-200/50 dark:border-neutral-700/50 flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<div
					className="flex items-center justify-center shrink-0"
					style={{ width: 32, height: 32 }}
				>
					<img
						src={loresmith}
						alt="LoreSmith logo"
						width={32}
						height={32}
						className="object-contain"
					/>
				</div>
				<h1 className="font-medium text-lg whitespace-nowrap text-neutral-700 dark:text-neutral-300">
					LoreSmith
				</h1>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{onSessionRecapRequest && (
					<Button
						variant="ghost"
						size="md"
						shape="square"
						className="tour-session-recap !h-8 !w-8 rounded-full flex items-center justify-center"
						onClick={onSessionRecapRequest}
						disabled={!selectedCampaignId}
						tooltip={
							selectedCampaignId
								? "Record session recap"
								: "Select a campaign to record a session recap"
						}
						aria-label={
							selectedCampaignId
								? "Record session recap"
								: "Select a campaign to record a session recap"
						}
					>
						<NotePencil size={18} />
					</Button>
				)}
			</div>
		</div>
	);
}
