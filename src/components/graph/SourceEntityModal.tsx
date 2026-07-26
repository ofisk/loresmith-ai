import { useCallback, useEffect, useState } from "react";
import { EntityDetailPanel } from "@/components/graph/EntityDetailPanel";
import { Modal } from "@/components/modal/Modal";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import type { OpenSourceEntityDetail } from "@/lib/source-navigation";

/**
 * Opens an entity's details when a source cited in a chat response is clicked.
 *
 * The graph view lives three levels deep (sidebar → campaign → details modal →
 * graph), which is too far to be a citation target. This mounts the same
 * by-id detail panel the graph uses, driven by a window event.
 */
export function SourceEntityModal() {
	const [target, setTarget] = useState<OpenSourceEntityDetail | null>(null);

	useEffect(() => {
		const handleOpenSourceEntity = (event: Event) => {
			const detail = (event as CustomEvent<OpenSourceEntityDetail>).detail;
			if (!detail?.campaignId || !detail?.entityId) return;
			setTarget(detail);
		};
		window.addEventListener(
			APP_EVENT_TYPE.OPEN_SOURCE_ENTITY,
			handleOpenSourceEntity as EventListener
		);
		return () => {
			window.removeEventListener(
				APP_EVENT_TYPE.OPEN_SOURCE_ENTITY,
				handleOpenSourceEntity as EventListener
			);
		};
	}, []);

	const handleClose = useCallback(() => setTarget(null), []);

	if (!target) return null;

	return (
		<Modal
			isOpen
			onClose={handleClose}
			className="max-w-2xl"
			options={{ clickOutsideToClose: true, showCloseButton: false }}
		>
			{/* Remount on entity change so the panel refetches. */}
			<EntityDetailPanel
				key={`${target.campaignId}:${target.entityId}`}
				campaignId={target.campaignId}
				entityId={target.entityId}
				onClose={handleClose}
			/>
		</Modal>
	);
}
