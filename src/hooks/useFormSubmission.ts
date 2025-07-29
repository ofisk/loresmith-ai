import { useCallback, useState } from "react";
import toast from "react-hot-toast";

/**
 * Hook for managing form submissions with validation, loading states, and error handling.
 *
 * This hook encapsulates the common pattern of:
 * - Form validation
 * - Loading states during submission
 * - Error handling and display
 * - Success callbacks
 * - Toast notifications
 *
 * @template T - The type of form data
 * @param submitFn - The async function to handle form submission
 * @param options - Configuration options for the form submission
 *
 * @example
 * ```typescript
 * const { handleSubmit, isSubmitting, error, setError } = useFormSubmission(
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
 *   <button disabled={isSubmitting}>
 *     {isSubmitting ? 'Submitting...' : 'Submit'}
 *   </button>
 * </form>
 * ```
 */
export function useFormSubmission<T>(
  submitFn: (data: T) => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: string) => void;
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
    validate?: (data: T) => string | null;
  } = {}
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (data: T) => {
      try {
        // Validate form data if validation function is provided
        if (options.validate) {
          const validationError = options.validate(data);
          if (validationError) {
            setError(validationError);
            if (options.showToast) {
              toast.error(validationError);
            }
            return;
          }
        }

        setIsSubmitting(true);
        setError(null);

        await submitFn(data);

        options.onSuccess?.();

        if (options.showToast && options.successMessage) {
          toast.success(options.successMessage);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : options.errorMessage || "Form submission failed";
        setError(errorMessage);
        options.onError?.(errorMessage);

        if (options.showToast) {
          toast.error(errorMessage);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitFn, options]
  );

  const reset = useCallback(() => {
    setIsSubmitting(false);
    setError(null);
  }, []);

  return {
    handleSubmit,
    isSubmitting,
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
 * const { handleSubmit, isSubmitting, error, data } = useFormSubmissionWithData(
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
    showToast?: boolean;
    successMessage?: string;
    errorMessage?: string;
    validate?: (data: T) => string | null;
  } = {}
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<R | null>(null);

  const handleSubmit = useCallback(
    async (formData: T) => {
      try {
        // Validate form data if validation function is provided
        if (options.validate) {
          const validationError = options.validate(formData);
          if (validationError) {
            setError(validationError);
            if (options.showToast) {
              toast.error(validationError);
            }
            return;
          }
        }

        setIsSubmitting(true);
        setError(null);

        const result = await submitFn(formData);

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
            : options.errorMessage || "Form submission failed";
        setError(errorMessage);
        options.onError?.(errorMessage);

        if (options.showToast) {
          toast.error(errorMessage);
        }

        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitFn, options]
  );

  const reset = useCallback(() => {
    setIsSubmitting(false);
    setError(null);
    setData(null);
  }, []);

  return {
    handleSubmit,
    isSubmitting,
    error,
    setError,
    data,
    reset,
  };
}
