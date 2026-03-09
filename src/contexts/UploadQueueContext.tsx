import { createContext, useCallback, useContext, useState } from "react";

export interface QueuedFile {
	file: File;
	filename: string;
	id: string;
}

export interface UploadQueueContextValue {
	queue: QueuedFile[];
	queuedCount: number;
	addToQueue: (files: QueuedFile[]) => void;
	removeFromQueue: (id: string) => void;
	clearQueue: () => void;
	isRetrying: boolean;
	setIsRetrying: (v: boolean) => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [queue, setQueue] = useState<QueuedFile[]>([]);
	const [isRetrying, setIsRetrying] = useState(false);

	const removeFromQueue = useCallback((id: string) => {
		setQueue((prev) => prev.filter((f) => f.id !== id));
	}, []);

	const clearQueue = useCallback(() => {
		setQueue([]);
	}, []);

	const addToQueue = useCallback((files: QueuedFile[]) => {
		setQueue((prev) => [...prev, ...files]);
	}, []);

	const value: UploadQueueContextValue = {
		queue,
		queuedCount: queue.length,
		addToQueue,
		removeFromQueue,
		clearQueue,
		isRetrying,
		setIsRetrying,
	};

	return (
		<UploadQueueContext.Provider value={value}>
			{children}
		</UploadQueueContext.Provider>
	);
}

export function useUploadQueue() {
	const ctx = useContext(UploadQueueContext);
	return ctx;
}
