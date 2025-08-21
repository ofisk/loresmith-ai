import { useCallback, useState } from "react";

/**
 * Hook for managing async operations with loading states, error handling, and success callbacks.
 *
 * This hook encapsulates the common pattern of:
 * - Setting loading state
 * - Handling errors
 * - Managing success callbacks
 * - Providing retry functionality
 *
 * @template T - The type of data returned by the operation
 * @param operation - The async function to execute
 * @param options - Configuration options for the operation
 *
 * @example
 * ```typescript
 * const { execute, loading, error, retry } = useAsyncOperation(
 *   async () => {
 *     const response = await fetch('/api/data');
 *     return response.json();
 *   },
 *   {
 *     onSuccess: (data) => console.log('Data loaded:', data),
 *     onError: (error) => console.error('Failed to load data:', error),
 *     showToast: true
 *   }
 * );
 *
 * // Execute the operation
 * await execute();
 * ```
 */
export function useAsyncOperation<T>(
  operation: () => Promise<T>,
  options: {
    onSuccess?: (result: T) => void;
    onError?: (error: string) => void;
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
  } = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await operation();

      setData(result);
      options.onSuccess?.(result);

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : options.errorMessage || "Operation failed";
      setError(errorMessage);
      options.onError?.(errorMessage);

      throw err;
    } finally {
      setLoading(false);
    }
  }, [operation, options]);

  const retry = useCallback(() => {
    setError(null);
    return execute();
  }, [execute]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    execute,
    retry,
    reset,
    loading,
    error,
    data,
    setError,
  };
}

/**
 * Hook for managing async operations that don't return data (void operations).
 *
 * @param operation - The async function to execute
 * @param options - Configuration options for the operation
 *
 * @example
 * ```typescript
 * const { execute, loading, error } = useAsyncOperation(
 *   async () => {
 *     await fetch('/api/delete', { method: 'DELETE' });
 *   },
 *   {
 *     successMessage: "Item deleted successfully",
 *     errorMessage: "Failed to delete item",
 *     showToast: true
 *   }
 * );
 * ```
 */
export function useAsyncVoidOperation(
  operation: () => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: string) => void;
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
  } = {}
) {
  return useAsyncOperation(operation, options);
}
