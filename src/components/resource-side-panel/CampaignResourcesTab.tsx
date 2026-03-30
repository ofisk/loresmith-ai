import {
	ArrowClockwise,
	CaretDownIcon,
	CaretRightIcon,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { getDisplayName } from "@/lib/display-name-utils";
import { chunkProgressPercent } from "@/lib/entity-extraction-progress";
import type { CampaignResource } from "@/types/campaign";

export interface EntityExtractionChunkProgress {
	processed: number;
	total: number;
}

interface CampaignResourcesTabProps {
	resources: CampaignResource[];
	loading: boolean;
	error: string | null;
	expandedResources: Set<string>;
	onExpandedChange: (next: Set<string>) => void;
	processingResources: Set<string>;
	/** Parsed PROGRESS:a/b from entity extraction queue when polling */
	extractionProgressByResourceId?: Record<
		string,
		EntityExtractionChunkProgress | null
	>;
	retryingResourceId: string | null;
	onRetry: (resourceId: string) => void;
	canRetryEntityExtraction?: boolean;
	retryLimitStatus?: Record<string, { canRetry: boolean; reason?: string }>;
	onAddResource: () => void;
	canAddResource?: boolean;
	onRemoveResource?: (resourceId: string) => void;
	canDeleteResource?: boolean;
}

/**
 * Linked resources tab: list with expand/collapse and retry entity extraction.
 */
export function CampaignResourcesTab({
	resources,
	loading,
	error,
	expandedResources,
	onExpandedChange,
	processingResources,
	extractionProgressByResourceId = {},
	retryingResourceId,
	onRetry,
	canRetryEntityExtraction = true,
	retryLimitStatus = {},
	onAddResource,
	canAddResource = true,
	onRemoveResource,
	canDeleteResource = false,
}: CampaignResourcesTabProps) {
	return (
		<div className="space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
				<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
					Linked resources
				</h3>
				<Button
					variant="secondary"
					size="sm"
					onClick={onAddResource}
					disabled={!canAddResource}
					tooltip={
						!canAddResource
							? "Only the campaign owner or Co-GM can add resources"
							: undefined
					}
					className="w-full sm:w-auto !text-blue-600 dark:!text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Plus size={16} weight="bold" />
					Add resource
				</Button>
			</div>
			{loading ? (
				<div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
					Loading resources…
				</div>
			) : error ? (
				<div className="text-center py-8 text-red-500 dark:text-red-400">
					Error loading resources: {error}
				</div>
			) : resources.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground">
					No resources linked to this campaign.
				</div>
			) : (
				<div className="space-y-3">
					{resources.map((resource) => {
						const isExpanded = expandedResources.has(resource.id);
						const toggleExpand = () => {
							const newExpanded = new Set(expandedResources);
							if (isExpanded) {
								newExpanded.delete(resource.id);
							} else {
								newExpanded.add(resource.id);
							}
							onExpandedChange(newExpanded);
						};

						return (
							<button
								key={resource.id}
								type="button"
								className="relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800 overflow-hidden cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors duration-200 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
								onClick={toggleExpand}
							>
								<div className="flex flex-col h-full">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
											<h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[var(--width-truncate-sm)] sm:max-w-[var(--width-truncate-md)]">
												{getDisplayName(resource)}
											</h4>
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												toggleExpand();
											}}
											type="button"
											aria-label={isExpanded ? "Collapse" : "Expand"}
											className="flex-shrink-0 p-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-200"
										>
											{isExpanded ? (
												<CaretDownIcon
													size={16}
													className="text-blue-600 dark:text-blue-400"
												/>
											) : (
												<CaretRightIcon
													size={16}
													className="text-blue-600 dark:text-blue-400"
												/>
											)}
										</button>
									</div>

									{processingResources.has(resource.id) && (
										<div className="mt-2 w-full">
											{(() => {
												const prog =
													extractionProgressByResourceId[resource.id];
												const pct = prog
													? chunkProgressPercent(prog.processed, prog.total)
													: null;
												if (pct !== null && prog) {
													return (
														<>
															<div
																className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
																role="progressbar"
																aria-valuenow={pct}
																aria-valuemin={0}
																aria-valuemax={100}
																aria-label={`Indexing ${pct} percent`}
															>
																<div
																	className="h-full rounded-full bg-blue-500/90 dark:bg-blue-400/80 transition-[width] duration-300"
																	style={{ width: `${pct}%` }}
																/>
															</div>
															<p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 tabular-nums">
																{pct}% indexed ({prog.processed} of {prog.total}{" "}
																chunks)
															</p>
														</>
													);
												}
												return (
													<p className="text-xs text-neutral-600 dark:text-neutral-400">
														Indexing…
													</p>
												);
											})()}
										</div>
									)}

									{isExpanded && (
										<div className="overflow-y-auto transition-opacity transition-[max-height] duration-300 ease-in-out max-h-96 opacity-100">
											<div className="mt-4 text-xs space-y-1">
												{resource.display_name && (
													<div className="flex justify-between items-center">
														<span className="text-neutral-600 dark:text-neutral-400">
															Display name:
														</span>
														<span className="font-medium text-neutral-900 dark:text-neutral-100">
															{resource.display_name}
														</span>
													</div>
												)}
												<div className="flex justify-between items-center">
													<span className="text-neutral-600 dark:text-neutral-400">
														Filename:
													</span>
													<span className="font-medium text-neutral-900 dark:text-neutral-100">
														{resource.file_name}
													</span>
												</div>
												<div className="flex justify-between items-center">
													<span className="text-neutral-600 dark:text-neutral-400">
														Added:
													</span>
													<span className="font-medium text-neutral-900 dark:text-neutral-100">
														{new Intl.DateTimeFormat("en-US", {
															month: "short",
															day: "numeric",
															year: "2-digit",
															hour: "numeric",
															minute: "2-digit",
															hour12: true,
														}).format(new Date(resource.created_at))}
													</span>
												</div>
											</div>

											{resource.description && (
												<div className="mt-3">
													<p className="text-sm text-neutral-600 dark:text-neutral-300">
														{resource.description}
													</p>
												</div>
											)}

											{resource.tags &&
												(() => {
													try {
														const tags =
															typeof resource.tags === "string"
																? JSON.parse(resource.tags)
																: resource.tags;
														if (Array.isArray(tags) && tags.length > 0) {
															return (
																<div className="mt-3">
																	<div className="flex flex-wrap gap-1">
																		{tags.map((tag: string) => (
																			<span
																				key={tag}
																				className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
																			>
																				{tag}
																			</span>
																		))}
																	</div>
																</div>
															);
														}
													} catch {
														// Invalid JSON, ignore
													}
													return null;
												})()}

											<div className="mt-4 space-y-2">
												{!canRetryEntityExtraction ? (
													<Tooltip content="Only the campaign owner can retry entity extraction">
														<span className="block w-full">
															<button
																type="button"
																disabled
																className="w-full px-3 py-2 text-sm font-medium rounded-md border transition-colors opacity-50 cursor-not-allowed text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700"
															>
																Retry entity extraction
															</button>
														</span>
													</Tooltip>
												) : (
													(() => {
														const limitKey = resource.file_key ?? resource.id;
														const limitInfo = retryLimitStatus[limitKey];
														const limitReached =
															limitInfo && !limitInfo.canRetry;
														const tooltipContent = limitReached
															? (limitInfo?.reason ?? "Retry limit reached")
															: undefined;
														const button = (
															<button
																type="button"
																onClick={(e) => {
																	if (!limitReached) {
																		e.stopPropagation();
																		onRetry(resource.id);
																	}
																}}
																disabled={
																	limitReached ||
																	retryingResourceId === resource.id ||
																	processingResources.has(resource.id)
																}
																title={tooltipContent}
																className="w-full px-3 py-2 text-sm font-medium rounded-md border transition-colors text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
															>
																{processingResources.has(resource.id) ? (
																	<span className="flex items-center justify-center gap-2">
																		<ArrowClockwise
																			size={16}
																			className="animate-spin"
																		/>
																		Processing…
																	</span>
																) : retryingResourceId === resource.id ? (
																	<span className="flex items-center justify-center gap-2">
																		<ArrowClockwise
																			size={16}
																			className="animate-spin"
																		/>
																		Retrying…
																	</span>
																) : (
																	"Retry entity extraction"
																)}
															</button>
														);
														return tooltipContent ? (
															<Tooltip content={tooltipContent}>
																<span className="block w-full">{button}</span>
															</Tooltip>
														) : (
															<span className="block w-full">{button}</span>
														);
													})()
												)}
												{onRemoveResource && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															onRemoveResource(resource.id);
														}}
														disabled={!canDeleteResource}
														title={
															!canDeleteResource
																? "Only the campaign owner can remove resources"
																: undefined
														}
														className="w-full px-3 py-2 text-sm font-medium rounded-md border transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-800 disabled:text-neutral-400 disabled:dark:text-neutral-500 disabled:border-neutral-200 disabled:dark:border-neutral-700 disabled:hover:border-neutral-200 disabled:dark:hover:border-neutral-700"
													>
														<Trash size={16} />
														Delete resource
													</button>
												)}
											</div>
										</div>
									)}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
