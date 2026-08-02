import { SidebarSimple } from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";

interface AppHeaderProps {
	onToggleSidebarCollapse?: () => void;
	isCollapsed?: boolean;
}

/**
 * AppHeader component - Sidebar header with logo and quick-action controls.
 * Rendered inside ResourceSidePanel so it appears on both the persistent
 * desktop sidebar and the off-canvas mobile sidebar.
 */
export function AppHeader({
	onToggleSidebarCollapse,
	isCollapsed = false,
}: AppHeaderProps) {
	if (isCollapsed) {
		return (
			<div className="app-header px-2 pt-4 pb-3 flex flex-col items-center gap-2">
				{onToggleSidebarCollapse && (
					<div className="hidden md:block">
						<Button
							variant="ghost"
							size="md"
							shape="circular"
							onClick={onToggleSidebarCollapse}
							tooltip="Expand sidebar"
							aria-label="Expand sidebar"
						>
							<SidebarSimple size={18} />
						</Button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="app-header px-4 pt-4 pb-3 flex flex-col gap-3">
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
				{onToggleSidebarCollapse && (
					<div className="hidden md:block ml-auto">
						<Button
							variant="ghost"
							size="md"
							shape="circular"
							onClick={onToggleSidebarCollapse}
							tooltip="Collapse sidebar"
							aria-label="Collapse sidebar"
						>
							<SidebarSimple size={18} />
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
