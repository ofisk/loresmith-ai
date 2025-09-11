import { ModalProvider } from "@/providers/ModalProvider";
import { TooltipProvider } from "@/providers/TooltipProvider";

/**
 * Main providers wrapper that composes all application providers
 *
 * Provides:
 * - Modal functionality (ModalProvider)
 * - Tooltip functionality (TooltipProvider)
 *
 * Note: NotificationProvider is handled inside the App component
 * where authentication state is available
 *
 * @param children - React children to wrap with all providers
 */
export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <TooltipProvider>
      <ModalProvider>{children}</ModalProvider>
    </TooltipProvider>
  );
};
