import { useEffect, useState } from "react";
import { USER_MESSAGES } from "../constants";
import { getStoredJwt, isJwtExpired } from "../services/auth-service";

interface UseJwtExpirationOptions {
  onExpiration?: () => void;
  checkOnMount?: boolean;
}

export function useJwtExpiration(options: UseJwtExpirationOptions = {}) {
  const { onExpiration, checkOnMount = true } = options;
  const [isExpired, setIsExpired] = useState(false);
  const [expirationMessage, setExpirationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    // Check JWT expiration on mount if requested
    if (checkOnMount) {
      const jwt = getStoredJwt();
      if (jwt && isJwtExpired(jwt)) {
        setIsExpired(true);
        setExpirationMessage(USER_MESSAGES.SESSION_EXPIRED);
        onExpiration?.();
      }
    }

    // Listen for JWT expiration events
    const handleJwtExpired = (event: CustomEvent) => {
      setIsExpired(true);
      setExpirationMessage(event.detail.message);
      onExpiration?.();
    };

    window.addEventListener("jwt-expired", handleJwtExpired as EventListener);

    return () => {
      window.removeEventListener(
        "jwt-expired",
        handleJwtExpired as EventListener
      );
    };
  }, [onExpiration, checkOnMount]);

  const clearExpiration = () => {
    setIsExpired(false);
    setExpirationMessage(null);
  };

  return {
    isExpired,
    expirationMessage,
    clearExpiration,
  };
}
