import { createContext, useContext, useRef, useState } from "react";

/**
 * Context type for tooltip state management
 */
type TooltipContextType = {
  activeTooltip: string | null;
  showTooltip: (id: string, isFocused: boolean) => void;
  hideTooltip: () => void;
};

const TooltipContext = createContext<TooltipContextType | null>(null);

/**
 * Tooltip provider component that manages tooltip state with smart timing
 *
 * Features:
 * - Delayed tooltip display (600ms delay)
 * - Grace period for quick mouse movements
 * - Immediate display for focused elements
 * - Proper cleanup of timeouts
 *
 * @param children - React children to wrap with tooltip context
 */
export const TooltipProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const showTimeout = useRef<number | null>(null);
  const graceTimeout = useRef<number | null>(null);
  const isWithinGracePeriod = useRef(false);
  const isTooltipShown = useRef(false);

  const showTooltip = (id: string, isFocused: boolean) => {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    if (graceTimeout.current) clearTimeout(graceTimeout.current);

    isTooltipShown.current = false; // Halt tooltips from auto-populating

    if (isFocused) {
      // Show tooltip immediately if the element has focus
      setActiveTooltip(id);
      isTooltipShown.current = true;
    } else if (isWithinGracePeriod.current) {
      // Show instantly if grace period is active
      setActiveTooltip(id);
      isTooltipShown.current = true;
    } else {
      // Apply delay before showing if not focused and not within grace period
      showTimeout.current = window.setTimeout(() => {
        setActiveTooltip(id);
        isTooltipShown.current = true;
      }, 600);
    }
  };

  const hideTooltip = () => {
    if (showTimeout.current) clearTimeout(showTimeout.current);

    // Hide tooltip immediately when user leaves
    setActiveTooltip(null);

    if (isTooltipShown.current) {
      // Only start grace period if tooltip was actually shown
      isWithinGracePeriod.current = true;

      graceTimeout.current = window.setTimeout(() => {
        isWithinGracePeriod.current = false; // Grace period ends
      }, 100);
    }
  };

  return (
    <TooltipContext.Provider
      value={{ activeTooltip, showTooltip, hideTooltip }}
    >
      {children}
    </TooltipContext.Provider>
  );
};

/**
 * Hook to access tooltip context
 *
 * @returns Tooltip context with activeTooltip, showTooltip, and hideTooltip
 * @throws Error if used outside of TooltipProvider
 */
export const useTooltip = () => {
  const context = useContext(TooltipContext);
  if (!context)
    throw new Error("useTooltip must be used within TooltipProvider");
  return context;
};
