import { useCallback, useEffect, useRef } from "react";
import { useActionQueue } from "@/contexts/ActionQueueContext";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";

const RETRY_INTERVAL_MS = 60_000;

export const ACTION_TYPE_ADD_TO_CAMPAIGN = "add_to_campaign";

export interface AddToCampaignPayload {
	file_key: string;
	file_name: string;
	campaignIds: string[];
}

function toMinimalResourceFile(
	item: AddToCampaignPayload
): ResourceFileWithCampaigns {
	return {
		id: item.file_key,
		file_key: item.file_key,
		file_name: item.file_name,
		file_size: 0,
		status: "completed",
		created_at: "",
		updated_at: "",
		campaigns: [],
	};
}

export function useActionQueueRetry(
	executors: {
		addFileToCampaigns: (
			file: ResourceFileWithCampaigns,
			campaignIds: string[],
			getJwt: () => string | null,
			notify: (type: string, title: string, message: string) => void
		) => Promise<unknown>;
	},
	getStoredJwt: () => string | null,
	addLocalNotification: (type: string, title: string, message: string) => void
) {
	const queue = useActionQueue();
	const executorsRef = useRef(executors);
	const getJwtRef = useRef(getStoredJwt);
	const notifyRef = useRef(addLocalNotification);
	executorsRef.current = executors;
	getJwtRef.current = getStoredJwt;
	notifyRef.current = addLocalNotification;

	const processNext = useCallback(async () => {
		if (!queue || queue.queuedCount === 0 || queue.isRetrying) return;
		const next = queue.queue[0];
		if (!next) return;

		queue.setIsRetrying(true);
		try {
			if (next.actionType === ACTION_TYPE_ADD_TO_CAMPAIGN) {
				const payload = next.payload as AddToCampaignPayload;
				const file = toMinimalResourceFile(payload);
				await executorsRef.current.addFileToCampaigns(
					file,
					payload.campaignIds,
					getJwtRef.current,
					notifyRef.current
				);
			}
			// Extend with more action types here
			queue.removeFromQueue(next.id);
		} catch {
			// Leave in queue for next retry
		} finally {
			queue.setIsRetrying(false);
		}
	}, [queue]);

	useEffect(() => {
		if (!queue || queue.queuedCount === 0) return;

		const initialTimeout = setTimeout(processNext, 2000);
		const intervalRef = setInterval(processNext, RETRY_INTERVAL_MS);

		return () => {
			clearTimeout(initialTimeout);
			clearInterval(intervalRef);
		};
	}, [queue?.queuedCount, processNext, queue]);
}
