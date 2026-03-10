import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/components/loader/Loader";
import { useAuthReady } from "@/hooks/useAuthReady";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

interface StorageUsage {
	username: string;
	totalBytes: number;
	fileCount: number;
	isAdmin: boolean;
	limitBytes: number;
	remainingBytes: number;
	usagePercentage: number;
}

export function StorageTracker() {
	const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const authReady = useAuthReady();

	const fetchStorageUsage = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const jwt = getStoredJwt();
			if (!jwt) {
				setError("Authentication required");
				return;
			}

			const { response, jwtExpired } = await authenticatedFetchWithExpiration(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE),
				{ jwt }
			);

			if (jwtExpired) {
				setError(
					"Session expired. Please refresh the page to re-authenticate."
				);
				return;
			}

			if (!response.ok) {
				throw new Error(`Failed to fetch storage usage: ${response.status}`);
			}

			const responseData = (await response.json()) as {
				success: boolean;
				usage?: StorageUsage;
			};
			if (responseData.success && responseData.usage) {
				setStorageUsage(responseData.usage);
			} else {
				throw new Error("Invalid response format");
			}
		} catch (err) {
			console.error("Failed to fetch storage usage:", err);
			setError(
				err instanceof Error ? err.message : "Failed to fetch storage usage"
			);
		} finally {
			setLoading(false);
		}
	}, []);

	// Fetch storage usage when auth becomes ready
	useEffect(() => {
		if (authReady) {
			fetchStorageUsage();
		}
	}, [authReady, fetchStorageUsage]);

	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	};

	// Don't show anything if auth is not ready yet
	if (!authReady) {
		return null;
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-1.5 px-2">
				<Loader size={12} />
			</div>
		);
	}

	if (error) {
		return <div className="text-red-500 text-xs px-2 py-1">Error: {error}</div>;
	}

	if (!storageUsage) {
		return null;
	}

	return (
		<div className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-700">
			<div className="flex items-center gap-2">
				<span className="text-xs text-neutral-600 dark:text-neutral-400 shrink-0">
					Storage
				</span>
				<div className="flex-1 min-w-0">
					<div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5">
						<div
							className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
							style={{
								width: `${Math.min(storageUsage.usagePercentage || 0, 100)}%`,
							}}
						/>
					</div>
				</div>
				<span className="text-xs text-neutral-500 shrink-0">
					{formatBytes(storageUsage.totalBytes || 0)} (
					{(storageUsage.usagePercentage || 0).toFixed(0)}%)
				</span>
			</div>
		</div>
	);
}
