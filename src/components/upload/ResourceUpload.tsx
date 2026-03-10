import { Plus } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { FormButton } from "@/components/button/FormButton";
import { ProcessingProgressBar } from "@/components/progress/ProcessingProgressBar";
import { EDIT_ROLES } from "@/constants/campaign-roles";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/types/campaign";
import type { ProcessingProgress } from "@/types/progress";

// Function to sanitize filename by removing/replacing URL-encoded characters
const sanitizeFilename = (filename: string): string => {
	return filename
		.replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filesystem characters
		.replace(/\s+/g, "_") // Replace spaces with underscores
		.replace(/[^\w\-_.]/g, "_") // Replace any other non-alphanumeric chars except -_.
		.replace(/_+/g, "_") // Replace multiple underscores with single
		.replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
		.replace(/\.(pdf|txt|doc|docx|md|mdx|json|jpg|jpeg|png|webp)$/i, (match) =>
			match.toLowerCase()
		); // Ensure supported file extensions are lowercase
};

export interface ResourceUploadOptions {
	/** When true, parent should not close the modal (e.g. more files to upload). */
	keepModalOpen?: boolean;
}

/** Called when upload hits a limit (403). Passes files to queue for background retry. */
export type OnUploadLimitReached = (
	succeededCount: number,
	filesToQueue: Array<{ file: File; filename: string }>
) => void;

interface ResourceUploadProps {
	onUpload: (
		file: File,
		filename: string,
		description: string,
		tags: string[],
		options?: ResourceUploadOptions
	) => void | Promise<void>;
	onCancel?: () => void;
	loading?: boolean;
	className?: string;
	jwtUsername?: string | null;
	uploadProgress?: ProcessingProgress | null;
	// Campaign selection props
	campaigns?: Campaign[];
	selectedCampaigns?: string[];
	onCampaignSelectionChange?: (campaignIds: string[]) => void;
	campaignName?: string;
	onCampaignNameChange?: (name: string) => void;
	onCreateCampaign?: () => void;
	showCampaignSelection?: boolean;
	onUploadLimitReached?: OnUploadLimitReached;
}

export const ResourceUpload = ({
	onUpload,
	onCancel,
	loading = false,
	className,
	jwtUsername: _jwtUsername,
	uploadProgress,
	campaigns = [],
	selectedCampaigns = [],
	onCampaignSelectionChange,
	campaignName: _campaignName = "",
	onCampaignNameChange: _onCampaignNameChange,
	onCreateCampaign,
	showCampaignSelection = false,
	onUploadLimitReached,
}: ResourceUploadProps) => {
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [_isValid, setIsValid] = useState(false);
	const [uploadSuccess, setUploadSuccess] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const fileInputId = useId();

	// Show progress bar if upload is in progress
	if (uploadProgress) {
		return (
			<div className={cn("space-y-4", className)}>
				<ProcessingProgressBar progress={uploadProgress} />
			</div>
		);
	}

	// Helper function to validate and filter files
	const validateAndFilterFiles = (files: File[]): File[] => {
		// Filter by file type (must match RAG-supported types: FileExtractionService + file-upload-security ALLOWED_EXTENSIONS)
		const allowedExtensions =
			/\.(pdf|txt|doc|docx|md|mdx|json|jpg|jpeg|png|webp)$/i;
		const typeValidFiles = files.filter((file) => {
			const byMime =
				file.type === "application/pdf" ||
				file.type === "text/plain" ||
				file.type === "text/markdown" ||
				file.type === "text/x-markdown" ||
				file.type === "application/msword" ||
				file.type ===
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
				file.type === "application/json" ||
				file.type === "image/jpeg" ||
				file.type === "image/jpg" ||
				file.type === "image/png" ||
				file.type === "image/webp";
			// Fallback: some browsers use generic MIME for .md/.mdx/.json or images
			const byExt = allowedExtensions.test(file.name);
			return byMime || byExt;
		});

		// Filter by file size (100MB max)
		const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
		const validFiles = typeValidFiles.filter((file) => {
			if (file.size > MAX_FILE_SIZE) {
				const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
				const fileSizeMB = file.size / (1024 * 1024);
				alert(
					`File "${file.name}" is too large (${fileSizeMB.toFixed(2)}MB). Maximum file size is ${maxSizeMB}MB. Please split the file into smaller parts.`
				);
				return false;
			}
			return true;
		});

		return validFiles;
	};

	// Helper function to set selected files state
	const setSelectedFilesState = (validFiles: File[]) => {
		if (validFiles.length > 0) {
			setSelectedFiles(validFiles);
			setIsValid(true);
			setUploadSuccess(false);
		} else {
			setSelectedFiles([]);
			setIsValid(false);
			setUploadSuccess(false);
		}
	};

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const input = event.target;
		// Copy FileList to array immediately (live list can invalidate after the event)
		const fileList = input.files;
		const files = fileList && fileList.length > 0 ? Array.from(fileList) : [];
		const validFiles = validateAndFilterFiles(files);
		if (files.length > 0 && validFiles.length === 0) {
			alert(
				"Unsupported file type. Allowed: PDF, TXT, DOC, DOCX, MD, MDX, JSON, JPG, JPEG, PNG, WEBP."
			);
		}
		setSelectedFilesState(validFiles);
	};

	const handleUpload = async () => {
		if (selectedFiles.length === 0) return;
		if (selectedFiles.length === 1) {
			const file = selectedFiles[0];
			const filename = sanitizeFilename(file.name);
			const keepModalOpen = false;
			try {
				await Promise.resolve(
					onUpload(file, filename, "", [], { keepModalOpen })
				);
				setUploadSuccess(true);
				return;
			} catch (err) {
				const isLimit = (err as Error & { isUploadLimitExceeded?: boolean })
					?.isUploadLimitExceeded;
				const isDuplicate = (err as Error & { isDuplicateFilename?: boolean })
					?.isDuplicateFilename;
				if (isLimit && onUploadLimitReached) {
					onUploadLimitReached(0, [{ file, filename }]);
					onCancel?.();
					return;
				}
				if (isDuplicate) {
					// Notification shown by AppModals; cancel upload for this file
					onCancel?.();
					return;
				}
				throw err;
			}
		}
		// Multiple files: close modal immediately and run uploads in background
		onCancel?.();
		void (async () => {
			let succeededCount = 0;
			for (let i = 0; i < selectedFiles.length; i++) {
				const file = selectedFiles[i];
				const filename = sanitizeFilename(file.name);
				try {
					await Promise.resolve(
						onUpload(file, filename, "", [], { keepModalOpen: false })
					);
					succeededCount++;
				} catch (err) {
					const isLimit = (err as Error & { isUploadLimitExceeded?: boolean })
						?.isUploadLimitExceeded;
					const isDuplicate = (err as Error & { isDuplicateFilename?: boolean })
						?.isDuplicateFilename;
					if (isLimit && onUploadLimitReached) {
						const filesToQueue = selectedFiles
							.slice(i)
							.map((f) => ({ file: f, filename: sanitizeFilename(f.name) }));
						onUploadLimitReached(succeededCount, filesToQueue);
					}
					// For duplicate: skip this file, continue with next (notification shown by AppModals)
					if (!isDuplicate) {
						break;
					}
				}
			}
		})();
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		const files = Array.from(event.dataTransfer.files);
		const validFiles = validateAndFilterFiles(files);
		setSelectedFilesState(validFiles);
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
	};

	const isUploadDisabled =
		selectedFiles.length === 0 ||
		loading ||
		(selectedFiles.length === 1 && uploadSuccess);

	return (
		<div className={cn("p-4 md:p-6 h-full flex flex-col min-h-0", className)}>
			{/* Header */}
			<div className="mb-4 md:mb-6">
				<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
					Add resource
				</h2>
				<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
					Add tomes and scrolls to your library
				</p>
			</div>

			{/* Content Area */}
			<div className="flex-1 overflow-y-auto flex flex-col justify-between py-3 md:py-6 min-h-0 pr-1">
				{/* Details Section */}
				<div className="space-y-6 md:space-y-10">
					{/* File Upload Area - label activates input on real user click so multi-select works (programmatic click() can force single-file in some browsers) */}
					<div className="flex justify-center">
						<label
							htmlFor={fileInputId}
							className={cn(
								"w-full max-w-md border-2 border-dashed border-gray-300/80 dark:border-gray-600/80 rounded-lg p-3 md:p-4 flex flex-col items-center justify-center cursor-pointer transition hover:border-gray-400 dark:hover:border-gray-500 focus-within:border-gray-400 dark:focus-within:border-gray-500 outline-none bg-gray-50/20 dark:bg-gray-800/10",
								loading && "opacity-50 pointer-events-none"
							)}
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onDragEnter={(e) => e.preventDefault()}
							onDragLeave={(e) => e.preventDefault()}
						>
							<input
								ref={fileInputRef}
								id={fileInputId}
								type="file"
								accept=".pdf,.txt,.doc,.docx,.md,.mdx,.json,.jpg,.jpeg,.png,.webp"
								onChange={handleFileSelect}
								className="sr-only"
								multiple
								aria-label="Choose files to upload"
							/>
							{selectedFiles.length > 0 ? (
								<div className="text-center relative w-full">
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setSelectedFiles([]);
											setUploadSuccess(false);
											setIsValid(false);
											if (fileInputRef.current) {
												fileInputRef.current.value = "";
											}
										}}
										className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition"
										aria-label="Clear files"
									>
										<svg
											className="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<title>Clear files</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
									{selectedFiles.length === 1 ? (
										<>
											<div className="text-ob-base-300 text-sm font-medium mb-2">
												{selectedFiles[0].name}
											</div>
											<div className="text-ob-base-200 text-sm">
												{(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB
											</div>
										</>
									) : (
										<>
											<div className="text-ob-base-300 text-sm font-medium mb-2">
												{selectedFiles.length} files selected
											</div>
											<div className="text-ob-base-200 text-xs max-h-20 overflow-y-auto text-left">
												{selectedFiles.slice(0, 5).map((f) => (
													<div key={f.name + f.size} className="truncate">
														{f.name}
													</div>
												))}
												{selectedFiles.length > 5 && (
													<div className="text-ob-base-200/80">
														…and {selectedFiles.length - 5} more
													</div>
												)}
											</div>
										</>
									)}
								</div>
							) : (
								<div className="text-center">
									<div className="text-ob-base-300 text-sm font-medium mb-2">
										Click to select or drag and drop files here
									</div>
								</div>
							)}
						</label>
					</div>
				</div>

				{/* Campaign Selection Section */}
				<div className="mt-5 md:mt-8">
					<div className="border-t border-ob-base-600 pt-5 md:pt-8">
						{showCampaignSelection && (
							<>
								<h3 className="text-sm font-medium text-ob-base-200 mb-3">
									Add to campaign (optional)
								</h3>

								<div className="space-y-2 mb-4">
									<div>
										{campaigns.length > 0 ? (
											<>
												<div className="block text-sm font-medium text-ob-base-200 mb-3">
													Select campaigns
												</div>
												<div className="flex flex-wrap gap-2">
													{campaigns.map((campaign) => {
														const isSelected = selectedCampaigns.includes(
															campaign.campaignId
														);
														const canAddToCampaign =
															!campaign.role || EDIT_ROLES.has(campaign.role);
														return (
															<button
																key={campaign.campaignId}
																type="button"
																onClick={() => {
																	if (!canAddToCampaign) return;
																	if (isSelected) {
																		// Remove from selection
																		onCampaignSelectionChange?.(
																			selectedCampaigns.filter(
																				(id) => id !== campaign.campaignId
																			)
																		);
																	} else {
																		// Add to selection
																		onCampaignSelectionChange?.([
																			...selectedCampaigns,
																			campaign.campaignId,
																		]);
																	}
																}}
																disabled={!canAddToCampaign}
																className={cn(
																	"px-3 py-1.5 text-sm transition-colors rounded border-2",
																	"focus:outline-none",
																	!canAddToCampaign
																		? "font-normal bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 cursor-not-allowed opacity-70"
																		: isSelected
																			? "font-medium bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
																			: "font-normal bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
																)}
																title={
																	canAddToCampaign
																		? campaign.name
																		: "You do not have permission to add resources to this campaign"
																}
															>
																{campaign.name}
															</button>
														);
													})}
													<button
														type="button"
														onClick={onCreateCampaign}
														className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
														title="Create new campaign"
													>
														<Plus size={14} />
													</button>
												</div>
											</>
										) : (
											<div className="space-y-3">
												<p className="text-sm text-ob-base-300">
													No campaigns yet. Create one to get started!
												</p>
												<button
													type="button"
													onClick={onCreateCampaign}
													className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center gap-2 text-sm"
												>
													<Plus size={14} />
													Create campaign
												</button>
											</div>
										)}
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center justify-between mt-4 md:mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
				<div className="flex gap-2">
					<FormButton
						variant="primary"
						onClick={() => void handleUpload()}
						disabled={isUploadDisabled}
						icon={
							selectedFiles.length === 1 && uploadSuccess ? (
								<svg
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Upload complete</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
							) : undefined
						}
					>
						{selectedFiles.length > 1
							? "Upload all"
							: selectedFiles.length === 1 && uploadSuccess
								? "Complete"
								: "Upload"}
					</FormButton>
					<FormButton
						onClick={() => {
							// Reset form state
							setSelectedFiles([]);
							setUploadSuccess(false);
							setIsValid(false);
							// Close the modal
							onCancel?.();
						}}
						variant="secondary"
					>
						Cancel
					</FormButton>
				</div>
			</div>
		</div>
	);
};
