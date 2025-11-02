import { useEffect, useCallback } from "react";

interface UiHint {
  type: string;
  data?: unknown;
}

interface UseUiHintsOptions {
  onUiHint?: (hint: UiHint) => void;
}

export function useUiHints(options: UseUiHintsOptions = {}) {
  const { onUiHint } = options;

  const handleUiHint = useCallback(
    (e: CustomEvent<{ type: string; data?: unknown }>) => {
      const { type, data } = e.detail || {};
      if (!type) return;
      onUiHint?.({ type, data });
    },
    [onUiHint]
  );

  useEffect(() => {
    window.addEventListener(
      "ui-hint",
      handleUiHint as unknown as EventListener
    );
    return () => {
      window.removeEventListener(
        "ui-hint",
        handleUiHint as unknown as EventListener
      );
    };
  }, [handleUiHint]);
}
