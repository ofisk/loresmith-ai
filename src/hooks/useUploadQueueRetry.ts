import { useCallback, useEffect, useRef } from "react";
import { useUploadQueue } from "@/contexts/UploadQueueContext";

const RETRY_INTERVAL_MS = 60_000;

export function useUploadQueueRetry(
	handleUpload: (
		file: File,
		filename: string,
		_description: string,
		_tags: string[]
	) => Promise<void>
) {
	const uploadQueue = useUploadQueue();
	const handleUploadRef = useRef(handleUpload);
	handleUploadRef.current = handleUpload;
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const processNext = useCallback(async () => {
		if (
			!uploadQueue ||
			uploadQueue.queuedCount === 0 ||
			uploadQueue.isRetrying
		) {
			return;
		}
		const next = uploadQueue.queue[0];
		if (!next) return;

		uploadQueue.setIsRetrying(true);
		try {
			await handleUploadRef.current(next.file, next.filename, "", []);
			uploadQueue.removeFromQueue(next.id);
		} catch {
			// Leave in queue for next retry
		} finally {
			uploadQueue.setIsRetrying(false);
		}
	}, [uploadQueue]);

	useEffect(() => {
		if (!uploadQueue || uploadQueue.queuedCount === 0) return;

		// Initial retry after 2s (give limit time to free)
		const initialTimeout = setTimeout(processNext, 2000);

		// Then retry periodically
		intervalRef.current = setInterval(processNext, RETRY_INTERVAL_MS);

		return () => {
			clearTimeout(initialTimeout);
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [uploadQueue, processNext]);
}
