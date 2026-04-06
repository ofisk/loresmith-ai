import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import libraryIcon from "@/assets/library.png";
import { CollapsibleCard } from "@/components/collapsible/CollapsibleCard";
import { ActionQueueUI } from "@/components/queue/ActionQueueUI";
import { RateLimitIndicator } from "@/components/rate-limit";
import { StorageTracker } from "@/components/storage-tracker";
import { ResourceList } from "@/components/upload/ResourceList";
import { useUploadQueue } from "@/contexts/UploadQueueContext";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { useResourceFiles } from "@/hooks/useResourceFiles";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { buildStagingFileKey } from "@/lib/file/file-utils";
import { cn } from "@/lib/utils";
import { AuthService, getStoredJwt } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";

interface LibrarySectionProps {
	isOpen: boolean;
	onToggle: () => void;
	onAddToLibrary: (initialFiles?: File[]) => void;
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

	const fetchResourcesRef = useRef(fetchResources);
	const setLoadingRef = useRef(setLoading);
	const setErrorRef = useRef(setError);
	useEffect(() => {
		fetchResourcesRef.current = fetchResources;
		setLoadingRef.current = setLoading;
		setErrorRef.current = setError;
	}, [fetchResources, setLoading, setError]);

	useEffect(() => {
		const handleJwtChanged = () => {
			const jwt = getStoredJwt();
			if (jwt && !AuthService.isJwtExpired(jwt)) {
				setLoadingRef.current(true);
				setErrorRef.current(null);
				fetchResourcesRef.current();
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
	}, []);

	// Refetch when library section is expanded (user may have uploaded while collapsed)
	useEffect(() => {
		if (isOpen && authReady) {
			fetchResources();
		}
	}, [isOpen, authReady, fetchResources]);

	useEffect(() => {
		const handleCampaignChange = () => {
			fetchResourcesRef.current();
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
	}, []);

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

	const fileDragDepthRef = useRef(0);
	const [isFileDragOver, setIsFileDragOver] = useState(false);
	const [librarySearchQuery, setLibrarySearchQuery] = useState("");
	const librarySearchInputId = useId();

	const handleLibraryDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		if (!Array.from(e.dataTransfer.types).includes("Files")) return;
		fileDragDepthRef.current += 1;
		setIsFileDragOver(true);
	}, []);

	const handleLibraryDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
		if (fileDragDepthRef.current === 0) {
			setIsFileDragOver(false);
		}
	}, []);

	const handleLibraryDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		if (Array.from(e.dataTransfer.types).includes("Files")) {
			e.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handleLibraryDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			fileDragDepthRef.current = 0;
			setIsFileDragOver(false);
			const files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;
			onAddToLibrary(files);
		},
		[onAddToLibrary]
	);

	return (
		<section
			aria-label="Your resource library"
			className={cn(
				"rounded-lg transition-shadow",
				isFileDragOver &&
					"ring-2 ring-purple-500/40 dark:ring-purple-400/35 ring-offset-2 ring-offset-neutral-50 dark:ring-offset-neutral-900"
			)}
			onDragEnter={handleLibraryDragEnter}
			onDragLeave={handleLibraryDragLeave}
			onDragOver={handleLibraryDragOver}
			onDrop={handleLibraryDrop}
		>
			<CollapsibleCard
				header={
					<>
						<img
							src={libraryIcon}
							alt="Library"
							className="w-8 h-8"
							width={32}
							height={32}
						/>
						<span className="font-medium text-sm">Your resource library</span>
					</>
				}
				headerSupplement={
					processingCount > 0 ? (
						<span
							className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
							title={`${processingCount} file${processingCount === 1 ? "" : "s"} preparing`}
						>
							{processingCount} preparing
						</span>
					) : undefined
				}
				isOpen={isOpen}
				onToggle={onToggle}
				tourClassName="tour-library-section"
				className="border-t border-neutral-200 dark:border-neutral-700"
			>
				<div className="flex flex-col">
					<div className="flex-shrink-0 p-2 space-y-2">
						<button
							type="button"
							onClick={() => onAddToLibrary()}
							className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
						>
							<Plus size={14} />
							Add to library
						</button>
						<div className="relative">
							<label htmlFor={librarySearchInputId} className="sr-only">
								Search library
							</label>
							<MagnifyingGlass
								className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
								aria-hidden
							/>
							<input
								id={librarySearchInputId}
								type="search"
								value={librarySearchQuery}
								onChange={(e) => setLibrarySearchQuery(e.target.value)}
								placeholder="Search library"
								autoComplete="off"
								className="w-full rounded-md border border-neutral-300 bg-neutral-100 py-1.5 pl-8 pr-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-neutral-500"
							/>
						</div>
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
								onOpenAddToLibrary={onAddToLibrary}
								campaigns={campaigns}
								campaignAdditionProgress={campaignAdditionProgress}
								_isAddingToCampaigns={isAddingToCampaigns}
								searchQuery={librarySearchQuery}
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
			</CollapsibleCard>
		</section>
	);
}
