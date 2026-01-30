import { useEffect, useCallback } from "react";
import { APP_EVENT_TYPE } from "@/lib/app-events";

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
      APP_EVENT_TYPE.UI_HINT,
      handleUiHint as unknown as EventListener
    );
    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.UI_HINT,
        handleUiHint as unknown as EventListener
      );
    };
  }, [handleUiHint]);
}
