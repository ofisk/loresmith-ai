import { useAuthentication } from "../../hooks/useAuthentication";

export interface AuthContextType {
  isAuthenticated: boolean;
  username: string;
  storedOpenAIKey: string;
  showAuthModal: boolean;
  showUserMenu: boolean;
  setShowAuthModal: (show: boolean) => void;
  setShowUserMenu: (show: boolean) => void;
  handleAuthenticationSubmit: (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => Promise<void>;
  handleLogout: () => Promise<void>;
  checkStoredOpenAIKey: (username: string) => Promise<void>;
  getStoredJwt: () => string | null;
}

export function useAuth(): AuthContextType {
  return useAuthentication();
}
