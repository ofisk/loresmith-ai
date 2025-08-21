import { useCallback, useState } from "react";
import { useBaseAsync } from "./useBaseAsync";

/**
 * Hook for managing form submissions with validation, loading states, and error handling.
 *
 * This hook uses the base async hook to provide:
 * - Form validation
 * - Loading states during submission
 * - Error handling and display
 * - Success callbacks

 *
 * @template T - The type of form data
 * @param submitFn - The async function to handle form submission
 * @param options - Configuration options for the form submission
 *
 * @example
 * ```typescript
 * const { handleSubmit, loading, error, setError } = useFormSubmission(
 *   async (formData) => {
 *     const response = await fetch('/api/submit', {
 *       method: 'POST',
 *       body: JSON.stringify(formData)
 *     });
 *     return response.json();
 *   },
 *   {
 *     onSuccess: () => console.log('Form submitted successfully'),
 *     successMessage: "Form submitted successfully!",
 *     errorMessage: "Failed to submit form"
 *   }
 * );
 *
 * // In your form component:
 * <form onSubmit={(e) => {
 *   e.preventDefault();
 *   handleSubmit(formData);
 * }}>
 *   {error && <div className="error">{error}</div>}
 *   <button disabled={loading}>
 *     {loading ? 'Submitting...' : 'Submit'}
 *   </button>
 * </form>
 * ```
 */
export function useFormSubmission<T>(
  submitFn: (data: T) => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: string) => void;
    successMessage?: string;
    errorMessage?: string;
    validate?: (data: T) => string | null;
  } = {}
) {
  const [error, setError] = useState<string | null>(null);

  const {
    execute,
    loading,
    reset: resetAsync,
  } = useBaseAsync(
    async (data: T) => {
      // Validate form data if validation function is provided
      if (options.validate) {
        const validationError = options.validate(data);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      await submitFn(data);
    },
    {
      onSuccess: options.onSuccess,
      onError: (error) => {
        setError(error);
        options.onError?.(error);
      },
      successMessage: options.successMessage,
      errorMessage: options.errorMessage,
    }
  );

  const handleSubmit = useCallback(
    async (data: T) => {
      setError(null);
      return execute(data);
    },
    [execute]
  );

  const reset = useCallback(() => {
    setError(null);
    resetAsync();
  }, [resetAsync]);

  return {
    handleSubmit,
    isSubmitting: loading,
    error,
    setError,
    reset,
  };
}

/**
 * Hook for managing form submissions with data return.
 *
 * @template T - The type of form data
 * @template R - The type of response data
 * @param submitFn - The async function to handle form submission
 * @param options - Configuration options for the form submission
 *
 * @example
 * ```typescript
 * const { handleSubmit, loading, error, data } = useFormSubmissionWithData(
 *   async (formData) => {
 *     const response = await fetch('/api/submit', {
 *       method: 'POST',
 *       body: JSON.stringify(formData)
 *     });
 *     return response.json();
 *   },
 *   {
 *     onSuccess: (result) => console.log('Response:', result),
 *     successMessage: "Form submitted successfully!"
 *   }
 * );
 * ```
 */
export function useFormSubmissionWithData<T, R>(
  submitFn: (data: T) => Promise<R>,
  options: {
    onSuccess?: (result: R) => void;
    onError?: (error: string) => void;
    successMessage?: string;
    errorMessage?: string;
    validate?: (data: T) => string | null;
  } = {}
) {
  const [error, setError] = useState<string | null>(null);

  const {
    execute,
    loading,
    data,
    reset: resetAsync,
  } = useBaseAsync(
    async (formData: T) => {
      // Validate form data if validation function is provided
      if (options.validate) {
        const validationError = options.validate(formData);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      return await submitFn(formData);
    },
    {
      onSuccess: options.onSuccess,
      onError: (error) => {
        setError(error);
        options.onError?.(error);
      },
      successMessage: options.successMessage,
      errorMessage: options.errorMessage,
    }
  );

  const handleSubmit = useCallback(
    async (formData: T) => {
      setError(null);
      return execute(formData);
    },
    [execute]
  );

  const reset = useCallback(() => {
    setError(null);
    resetAsync();
  }, [resetAsync]);

  return {
    handleSubmit,
    isSubmitting: loading,
    error,
    setError,
    data,
    reset,
  };
}
