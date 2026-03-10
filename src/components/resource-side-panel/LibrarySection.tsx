import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import libraryIcon from "@/assets/library.png";
import { Card } from "@/components/card/Card";
import { ActionQueueUI } from "@/components/queue/ActionQueueUI";
import { RateLimitIndicator } from "@/components/rate-limit";
import { StorageTracker } from "@/components/storage-tracker";
import { ResourceList } from "@/components/upload/ResourceList";
import { useUploadQueue } from "@/contexts/UploadQueueContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { useResourceFiles } from "@/hooks/useResourceFiles";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { buildStagingFileKey } from "@/lib/file-utils";
import { AuthService, getStoredJwt } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";

interface LibrarySectionProps {
	isOpen: boolean;
	onToggle: () => void;
	onAddToLibrary: () => void;
	onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
	onEditFile?: (file: ResourceFileWithCampaigns) => void;
	campaigns?: Campaign[];
	campaignAdditionProgress?: Record<string, number>;
	isAddingToCampaigns?: boolean;
	addLocalNotification?: (type: string, title: string, message: string) => void;
	onShowUsageLimits?: () => void;
}

export function LibrarySection({
	isOpen,
	onToggle,
	onAddToLibrary,
	onAddToCampaign,
	onEditFile,
	campaigns = [],
	campaignAdditionProgress = {},
	isAddingToCampaigns = false,
	addLocalNotification,
	onShowUsageLimits,
}: LibrarySectionProps) {
	const authReady = useAuthReady();
	const uploadQueue = useUploadQueue();
	const {
		files,
		loading,
		error,
		fetchResources,
		setFiles,
		setError,
		setLoading,
		processingCount,
	} = useResourceFiles({ campaigns });

	useEffect(() => {
		if (authReady) {
			setLoading(true);
			setError(null);
			fetchResources();
		} else {
			const jwt = getStoredJwt();
			if (jwt) {
				setError(null);
				setLoading(false);
			} else {
				setError("Please authenticate to view resources.");
				setLoading(false);
			}
		}
	}, [authReady, fetchResources, setLoading, setError]);

	useEffect(() => {
		const handleJwtChanged = () => {
			const jwt = getStoredJwt();
			if (jwt && !AuthService.isJwtExpired(jwt)) {
				setLoading(true);
				setError(null);
				fetchResources();
			}
		};
		window.addEventListener(
			APP_EVENT_TYPE.JWT_CHANGED,
			handleJwtChanged as EventListener
		);
		return () => {
			window.removeEventListener(
				APP_EVENT_TYPE.JWT_CHANGED,
				handleJwtChanged as EventListener
			);
		};
	}, [fetchResources, setLoading, setError]);

	useEffect(() => {
		const handleCampaignChange = () => {
			fetchResources();
		};
		window.addEventListener(
			APP_EVENT_TYPE.CAMPAIGN_CREATED,
			handleCampaignChange as EventListener
		);
		window.addEventListener(
			APP_EVENT_TYPE.CAMPAIGN_FILE_ADDED,
			handleCampaignChange as EventListener
		);
		window.addEventListener(
			APP_EVENT_TYPE.CAMPAIGN_FILE_REMOVED,
			handleCampaignChange as EventListener
		);
		return () => {
			window.removeEventListener(
				APP_EVENT_TYPE.CAMPAIGN_CREATED,
				handleCampaignChange as EventListener
			);
			window.removeEventListener(
				APP_EVENT_TYPE.CAMPAIGN_FILE_ADDED,
				handleCampaignChange as EventListener
			);
			window.removeEventListener(
				APP_EVENT_TYPE.CAMPAIGN_FILE_REMOVED,
				handleCampaignChange as EventListener
			);
		};
	}, [fetchResources]);

	// Merge queued files from UploadQueueContext so all queued uploads appear in the list
	const displayFiles = useMemo(() => {
		const tenant = AuthService.getUsernameFromStoredJwt();
		if (!tenant || !uploadQueue?.queue.length) return files;

		const existingKeys = new Set(files.map((f) => f.file_key));
		const queuedEntries: ResourceFileWithCampaigns[] = [];

		for (const q of uploadQueue.queue) {
			const fileKey = buildStagingFileKey(tenant, q.filename);
			if (existingKeys.has(fileKey)) continue;
			existingKeys.add(fileKey);
			queuedEntries.push({
				id: q.id,
				file_key: fileKey,
				file_name: q.filename,
				file_size: q.file.size,
				status: "queued_for_upload",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				campaigns: [],
			});
		}

		return [...queuedEntries, ...files];
	}, [files, uploadQueue?.queue]);

	return (
		<Card className="tour-library-section p-0 border-t border-neutral-200 dark:border-neutral-700 flex flex-col">
			<button
				type="button"
				onClick={onToggle}
				className="w-full p-2 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
			>
				<div className="flex items-center gap-2">
					<img src={libraryIcon} alt="Library" className="w-8 h-8" />
					<span className="font-medium text-sm">Your resource library</span>
					{processingCount > 0 && (
						<span
							className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
							title={`${processingCount} file${processingCount === 1 ? "" : "s"} preparing`}
						>
							{processingCount} preparing
						</span>
					)}
				</div>
				{isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
			</button>

			{isOpen && (
				<div className="border-t border-neutral-200 dark:border-neutral-700 flex flex-col">
					<div className="flex-shrink-0 p-2">
						<button
							type="button"
							onClick={onAddToLibrary}
							className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
						>
							<Plus size={14} />
							Add to library
						</button>
					</div>
					<div className="border-t border-neutral-200 dark:border-neutral-700 flex flex-col">
						<div className="max-h-64 overflow-y-auto">
							<ResourceList
								files={displayFiles}
								setFiles={setFiles}
								loading={loading}
								error={error}
								setError={setError}
								setLoading={setLoading}
								fetchResources={fetchResources}
								onAddToCampaign={onAddToCampaign}
								onEditFile={onEditFile}
								campaigns={campaigns}
								campaignAdditionProgress={campaignAdditionProgress}
								_isAddingToCampaigns={isAddingToCampaigns}
							/>
						</div>
						<div className="flex-shrink-0">
							<StorageTracker />
							{uploadQueue && uploadQueue.queuedCount > 0 && (
								<div className="px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-t border-neutral-200 dark:border-neutral-700">
									{uploadQueue.queuedCount} file
									{uploadQueue.queuedCount === 1 ? "" : "s"} queued – retrying
									when capacity is available
								</div>
							)}
							<ActionQueueUI />
							{addLocalNotification && onShowUsageLimits && (
								<RateLimitIndicator
									addLocalNotification={addLocalNotification}
									onShowUsageLimits={onShowUsageLimits}
								/>
							)}
						</div>
					</div>
				</div>
			)}
		</Card>
	);
}
