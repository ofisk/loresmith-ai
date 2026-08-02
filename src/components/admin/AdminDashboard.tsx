import { useState } from "react";
import { ExperimentsPanel } from "@/components/admin/ExperimentsPanel";
import { TelemetryDashboard } from "@/components/admin/TelemetryDashboard";

type AdminTab = "telemetry" | "experiments";

const TABS: { id: AdminTab; label: string }[] = [
	{ id: "telemetry", label: "Telemetry" },
	{ id: "experiments", label: "Flags & experiments" },
];

/**
 * Tab shell for the admin modal opened from `AppHeader` (gated on
 * `payload?.isAdmin === true`). Added rather than a second modal so that admin
 * access stays gated in exactly one place, per issue #755.
 *
 * Both panels are mounted lazily by tab rather than kept alive behind CSS: the
 * telemetry dashboard issues several aggregate queries on mount, and paying for
 * those while an admin is toggling a flag would be pure waste.
 */
export function AdminDashboard() {
	const [tab, setTab] = useState<AdminTab>("telemetry");

	return (
		<div className="flex flex-col h-full min-w-0 overflow-x-hidden">
			<div
				className="flex gap-1 px-4 md:px-8 pt-4 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0"
				role="tablist"
				aria-label="Admin sections"
			>
				{TABS.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						className={`px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px ${
							tab === id
								? "border-blue-500 font-medium text-neutral-900 dark:text-neutral-100"
								: "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
						}`}
						onClick={() => setTab(id)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto">
				{tab === "telemetry" ? (
					<TelemetryDashboard />
				) : (
					<div className="p-4 md:p-8">
						<ExperimentsPanel />
					</div>
				)}
			</div>
		</div>
	);
}
