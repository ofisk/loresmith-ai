import { ChartBar } from "@phosphor-icons/react";
import { Card } from "@/components/card/Card";

interface TelemetrySectionProps {
	onOpen: () => void;
	isCollapsed?: boolean;
}

export function TelemetrySection({
	onOpen,
	isCollapsed = false,
}: TelemetrySectionProps) {
	return (
		<Card className="tour-admin-dashboard p-0 flex flex-col">
			<button
				type="button"
				onClick={onOpen}
				title={isCollapsed ? "Telemetry" : undefined}
				aria-label={isCollapsed ? "Telemetry" : undefined}
				className={
					isCollapsed
						? "w-full p-1.5 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
						: "w-full p-2 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
				}
			>
				<span className="w-8 h-8 flex items-center justify-center shrink-0">
					<ChartBar size={20} weight="light" className="text-primary" />
				</span>
				{!isCollapsed && <span className="font-medium text-sm">Telemetry</span>}
			</button>
		</Card>
	);
}
