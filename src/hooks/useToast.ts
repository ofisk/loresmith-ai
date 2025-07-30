import { useCallback } from "react";
import toast from "react-hot-toast";

/**
 * Hook for managing toast notifications with consistent styling and behavior.
 *
 * This hook provides a centralized way to show success, error, and info notifications
 * with consistent styling and behavior across the application.
 *
 * @example
 * ```typescript
 * const { showSuccess, showError, showInfo } = useToast();
 *
 * // Show success message
 * showSuccess("Operation completed successfully!");
 *
 * // Show error message
 * showError("Something went wrong");
 *
 * // Show info message
 * showInfo("Please wait while we process your request");
 * ```
 */
export function useToast() {
  const showSuccess = useCallback((message: string, duration?: number) => {
    toast.success(message, {
      duration: duration || 4000,
      position: "top-right",
    });
  }, []);

  const showError = useCallback((message: string, duration?: number) => {
    toast.error(message, {
      duration: duration || 6000,
      position: "top-right",
    });
  }, []);

  const showInfo = useCallback((message: string, duration?: number) => {
    toast(message, {
      duration: duration || 4000,
      position: "top-right",
      icon: "ℹ️",
    });
  }, []);

  const showWarning = useCallback((message: string, duration?: number) => {
    toast(message, {
      duration: duration || 5000,
      position: "top-right",
      icon: "⚠️",
      style: {
        background: "#fbbf24",
        color: "#1f2937",
      },
    });
  }, []);

  const showLoading = useCallback((message: string) => {
    return toast.loading(message, {
      position: "top-right",
    });
  }, []);

  const dismiss = useCallback((toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  }, []);

  return {
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showLoading,
    dismiss,
  };
}
