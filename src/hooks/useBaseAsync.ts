import { useCallback, useState, useRef } from "react";

/**
 * Base hook for managing async operations with loading states, error handling, and success callbacks.
 *
 * This hook encapsulates the common pattern of:
 * - Setting loading state
 * - Handling errors
 * - Managing success callbacks
 * - Providing retry functionality

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
    successMessage?: string;
    errorMessage?: string;
    autoExecute?: boolean;
    autoExecuteArgs?: P;
  } = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  // Store options in a ref to prevent unnecessary re-renders
  const optionsRef = useRef(options);

  const execute = useCallback(
    async (...args: P): Promise<T> => {
      // Update the ref with current options at execution time
      optionsRef.current = options;

      try {
        setLoading(true);
        setError(null);

        const result = await asyncFn(...args);

        setData(result);
        optionsRef.current.onSuccess?.(result);

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : optionsRef.current.errorMessage || "Operation failed";
        setError(errorMessage);
        optionsRef.current.onError?.(errorMessage);

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn, options]
  );

  const retry = useCallback(() => {
    setError(null);
    if (optionsRef.current.autoExecute && optionsRef.current.autoExecuteArgs) {
      return execute(...optionsRef.current.autoExecuteArgs);
    }
    return execute;
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

 *   }
 * );
 * ```
 */
export function useBaseAsyncVoid<P extends any[]>(
  asyncFn: (...args: P) => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: string) => void;
    successMessage?: string;
    errorMessage?: string;
    autoExecute?: boolean;
    autoExecuteArgs?: P;
  } = {}
) {
  return useBaseAsync(asyncFn, options);
}
