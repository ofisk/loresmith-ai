import { createContext, useCallback, useContext, useState } from "react";

export type QueuedReason = "quota" | "rate_limit";

export interface QueuedAction<T = unknown> {
	id: string;
	actionType: string;
	label: string;
	payload: T;
	reason: QueuedReason;
	addedAt: number;
}

export interface ActionQueueContextValue {
	queue: QueuedAction[];
	queuedCount: number;
	addToQueue: (item: {
		actionType: string;
		label: string;
		payload: unknown;
		reason: QueuedReason;
	}) => void;
	removeFromQueue: (id: string) => void;
	clearQueue: () => void;
	isRetrying: boolean;
	setIsRetrying: (v: boolean) => void;
}

const ActionQueueContext = createContext<ActionQueueContextValue | null>(null);

export function ActionQueueProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [queue, setQueue] = useState<QueuedAction[]>([]);
	const [isRetrying, setIsRetrying] = useState(false);

	const removeFromQueue = useCallback((id: string) => {
		setQueue((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const clearQueue = useCallback(() => {
		setQueue([]);
	}, []);

	const addToQueue = useCallback(
		(item: {
			actionType: string;
			label: string;
			payload: unknown;
			reason: QueuedReason;
		}) => {
			const id = `${item.actionType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			setQueue((prev) => [
				...prev,
				{ ...item, id, addedAt: Date.now() } as QueuedAction,
			]);
		},
		[]
	);

	const value: ActionQueueContextValue = {
		queue,
		queuedCount: queue.length,
		addToQueue,
		removeFromQueue,
		clearQueue,
		isRetrying,
		setIsRetrying,
	};

	return (
		<ActionQueueContext.Provider value={value}>
			{children}
		</ActionQueueContext.Provider>
	);
}

export function useActionQueue() {
	return useContext(ActionQueueContext);
}
