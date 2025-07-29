import type { ReactNode } from "react";
import { Loader } from "../loader/Loader";

/**
 * Props for the AsyncList component
 */
export interface AsyncListProps<T> {
  /** The data to render */
  data: T[] | null | undefined;
  /** Whether the data is currently loading */
  loading: boolean;
  /** Error message if the data failed to load */
  error: string | null;
  /** Function to render each item in the list */
  renderItem: (item: T, index: number) => ReactNode;
  /** Custom loading component */
  loadingComponent?: ReactNode;
  /** Custom error component */
  errorComponent?: ReactNode;
  /** Custom empty state component */
  emptyComponent?: ReactNode;
  /** Function to retry loading the data */
  onRetry?: () => void;
  /** CSS class name for the container */
  className?: string;
  /** CSS class name for the list container */
  listClassName?: string;
}

/**
 * A reusable component for handling async list data with loading, error, and empty states.
 *
 * This component provides a consistent interface for displaying lists that load data asynchronously.
 * It handles all the common states (loading, error, empty, success) and provides customizable
 * components for each state.
 *
 * @template T - The type of items in the list
 *
 * @example
 * ```typescript
 * <AsyncList
 *   data={campaigns}
 *   loading={loading}
 *   error={error}
 *   renderItem={(campaign) => (
 *     <CampaignCard key={campaign.id} campaign={campaign} />
 *   )}
 *   onRetry={fetchCampaigns}
 * />
 * ```
 */
export function AsyncList<T>({
  data,
  loading,
  error,
  renderItem,
  loadingComponent,
  errorComponent,
  emptyComponent,
  onRetry,
  className = "",
  listClassName = "",
}: AsyncListProps<T>) {
  // Loading state
  if (loading) {
    return (
      <div className={`flex justify-center items-center py-8 ${className}`}>
        {loadingComponent || (
          <div className="flex items-center space-x-2">
            <Loader size={20} />
            <span className="text-gray-600">Loading...</span>
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        {errorComponent || (
          <div className="space-y-4">
            <div className="text-red-600">
              <p className="font-medium">Failed to load data</p>
              <p className="text-sm">{error}</p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        {emptyComponent || (
          <div className="text-gray-500">
            <p>No items found</p>
          </div>
        )}
      </div>
    );
  }

  // Success state - render the list
  return (
    <div className={`space-y-4 ${listClassName}`}>
      {data.map((item, index) => renderItem(item, index))}
    </div>
  );
}
