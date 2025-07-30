import type { ReactNode } from "react";
import { Button } from "../button/Button";
import { Loader } from "../loader/Loader";
import { Modal } from "../modal/Modal";

/**
 * Props for the FormModal component
 */
export interface FormModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Function to call when the modal should close */
  onClose: () => void;
  /** The title of the modal */
  title: string;
  /** The form content */
  children: ReactNode;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Function to handle form submission */
  onSubmit: (e: React.FormEvent) => void;
  /** Text for the submit button */
  submitText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Whether to show the cancel button */
  showCancel?: boolean;
  /** Custom submit button component */
  submitButton?: ReactNode;
  /** Custom cancel button component */
  cancelButton?: ReactNode;
  /** CSS class name for the modal content */
  className?: string;
  /** CSS class name for the form */
  formClassName?: string;
}

/**
 * A reusable modal component for forms with built-in loading states and error handling.
 *
 * This component provides a consistent interface for modal forms across the application.
 * It handles common patterns like loading states during submission, error display,
 * and proper form submission handling.
 *
 * @example
 * ```typescript
 * <FormModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="Create Campaign"
 *   isSubmitting={isSubmitting}
 *   error={error}
 *   onSubmit={handleSubmit}
 * >
 *   <div className="space-y-4">
 *     <Input
 *       label="Campaign Name"
 *       value={name}
 *       onChange={(e) => setName(e.target.value)}
 *     />
 *   </div>
 * </FormModal>
 * ```
 */
export function FormModal({
  isOpen,
  onClose,
  title,
  children,
  isSubmitting = false,
  error,
  onSubmit,
  submitText = "Submit",
  cancelText = "Cancel",
  showCancel = true,
  submitButton,
  cancelButton,
  className = "",
  formClassName = "",
}: FormModalProps) {
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSubmitting) {
      onSubmit(e);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className={`p-6 max-w-2xl ${className}`}>
        <h2 className="text-xl font-semibold mb-6">{title}</h2>

        <form onSubmit={handleSubmit} className={`space-y-6 ${formClassName}`}>
          {children}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            {showCancel &&
              (cancelButton || (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  {cancelText}
                </Button>
              ))}

            {submitButton || (
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader size={16} />
                    Submitting...
                  </>
                ) : (
                  submitText
                )}
              </Button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}
