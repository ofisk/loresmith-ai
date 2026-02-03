import { useCallback, useEffect, useRef, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { FormButton } from "@/components/button/FormButton";

const CONFIRM_DURATION_MS = 7000;
const PROGRESS_INTERVAL_MS = 50;

interface ConfirmDeleteButtonProps {
  label?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Delete button that requires a second step: click once to show confirm state
 * with a countdown progress bar; click "Confirm delete" within the window to delete.
 * Cancel or letting the countdown finish resets the button.
 */
export function ConfirmDeleteButton({
  label = "Delete campaign",
  confirmLabel = "Confirm delete",
  onConfirm,
  disabled = false,
}: ConfirmDeleteButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleStartConfirm = () => {
    setShowConfirm(true);
    setProgress(0);
    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / CONFIRM_DURATION_MS, 1);
      setProgress(pct * 100);
      if (pct >= 1) {
        clearTimers();
        setShowConfirm(false);
        setProgress(0);
      }
    }, PROGRESS_INTERVAL_MS);
  };

  const handleCancel = () => {
    clearTimers();
    setShowConfirm(false);
    setProgress(0);
  };

  const handleConfirm = async () => {
    clearTimers();
    setShowConfirm(false);
    setProgress(0);
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  if (!showConfirm) {
    return (
      <FormButton
        onClick={handleStartConfirm}
        disabled={disabled}
        variant="destructive"
        icon={<Trash size={16} />}
      >
        {label}
      </FormButton>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={handleCancel} disabled={isDeleting}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={handleConfirm}
        disabled={isDeleting}
        className="relative flex items-center gap-2 overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-gray-400/30 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
        <div className="relative z-10 flex items-center gap-2">
          <Trash size={16} />
          {isDeleting ? "Deleting..." : confirmLabel}
        </div>
      </Button>
    </div>
  );
}
