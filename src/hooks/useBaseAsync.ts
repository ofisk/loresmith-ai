import { useCallback, useState } from "react";
import toast from "react-hot-toast";

/**
 * Base hook for managing async operations with loading states, error handling, and success callbacks.
 *
 * This hook encapsulates the common pattern of:
 * - Setting loading state
 * - Handling errors
 * - Managing success callbacks
 * - Providing retry functionality
 * - Toast notifications
 *
 * @template T - The type of data returned by the operation
 * @template P - The type of parameters for the operation
 * @param asyncFn - The async function to execute
 * @param options - Configuration options for the operation
 *
 * @example
 * ```typescript
 * const { execute, loading, error, retry } = useBaseAsync(
 *   async (id: string) => {
 *     const response = await fetch(`/api/data/${id}`);
 *     return response.json();
 *   },
 *   {
 *     onSuccess: (data) => console.log('Data loaded:', data),
 *     onError: (error) => console.error('Failed to load data:', error),
 *     showToast: true,
 *     successMessage: "Data loaded successfully",
 *     errorMessage: "Failed to load data"
 *   }
 * );
 *
 * // Execute the operation
 * await execute("123");
 * ```
 */
export function useBaseAsync<T, P extends any[]>(
  asyncFn: (...args: P) => Promise<T>,
  options: {
    onSuccess?: (result: T) => void;
    onError?: (error: string) => void;
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
    autoExecute?: boolean;
    autoExecuteArgs?: P;
  } = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: P): Promise<T> => {
      try {
        setLoading(true);
        setError(null);

        const result = await asyncFn(...args);

        setData(result);
        options.onSuccess?.(result);

        if (options.showToast && options.successMessage) {
          toast.success(options.successMessage);
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : options.errorMessage || "Operation failed";
        setError(errorMessage);
        options.onError?.(errorMessage);

        if (options.showToast) {
          toast.error(errorMessage);
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn, options]
  );

  const retry = useCallback(() => {
    setError(null);
    if (options.autoExecute && options.autoExecuteArgs) {
      return execute(...options.autoExecuteArgs);
    }
    return execute;
  }, [execute, options.autoExecute, options.autoExecuteArgs]);

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
 * @template P - The type of parameters for the operation
 * @param asyncFn - The async function to execute
 * @param options - Configuration options for the operation
 *
 * @example
 * ```typescript
 * const { execute, loading, error } = useBaseAsyncVoid(
 *   async (id: string) => {
 *     await fetch(`/api/delete/${id}`, { method: 'DELETE' });
 *   },
 *   {
 *     successMessage: "Item deleted successfully",
 *     errorMessage: "Failed to delete item",
 *     showToast: true
 *   }
 * );
 * ```
 */
export function useBaseAsyncVoid<P extends any[]>(
  asyncFn: (...args: P) => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: string) => void;
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
    autoExecute?: boolean;
    autoExecuteArgs?: P;
  } = {}
) {
  return useBaseAsync(asyncFn, options);
}
