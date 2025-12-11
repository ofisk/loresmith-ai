import type React from "react";
import { useEffect, useId, useState } from "react";
import { PrimaryActionButton } from "./button";
import { FormField } from "./input/FormField";
import { Modal } from "./modal/Modal";

interface BlockingAuthenticationModalProps {
  isOpen: boolean;
  username?: string; // Not used anymore, kept for backward compatibility
  storedOpenAIKey?: string;
  onSubmit: (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => Promise<void>;
  onClose?: () => void;
}

export function BlockingAuthenticationModal({
  isOpen,
  storedOpenAIKey,
  onSubmit,
}: BlockingAuthenticationModalProps) {
  const usernameId = useId();
  const adminKeyId = useId();
  const openaiKeyId = useId();
  const [currentUsername, setCurrentUsername] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill OpenAI key if we have a stored one
  useEffect(() => {
    if (storedOpenAIKey && isOpen) {
      setOpenaiApiKey(storedOpenAIKey);
    }
  }, [storedOpenAIKey, isOpen]);

  // Keep user-provided values when modal is shown due to errors
  // Don't reset form fields when modal is opened (only clear error)
  useEffect(() => {
    if (isOpen) {
      setError(null); // Clear error when modal opens
      // Don't reset form fields - preserve user input
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onSubmit(currentUsername, adminKey, openaiApiKey);
      // Only clear form on success - preserve values on error
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      // Keep user-provided values on error so they can retry
      // Don't clear the form fields
    } finally {
      setIsLoading(false);
    }
  };

  const isOpenAIKeyDisabled = !!storedOpenAIKey;
  const openaiKeyDisplay = storedOpenAIKey
    ? `${storedOpenAIKey.substring(0, 8)}...${storedOpenAIKey.substring(storedOpenAIKey.length - 4)}`
    : "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Disable closing - authentication is required
      clickOutsideToClose={false}
      showCloseButton={false}
      allowEscape={false}
      animatedBackground={true} // Enable the cool purple animation!
    >
      <div className="p-6 max-w-md mx-auto">
        <h2 className="text-xl font-semibold mb-4">Authentication required</h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Present your credentials to enter the halls of LoreSmith. You'll need
          your own OpenAI API key to unlock these ancient gates. Providing the
          sacred admin key grants unlimited storage access.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            id={usernameId}
            label="Username"
            placeholder="Speak your name..."
            value={currentUsername}
            onValueChange={(value, _isValid) => setCurrentUsername(value)}
            disabled={false}
          >
            <p className="text-xs text-gray-500 mt-1">
              Forge your identity in the realm of LoreSmith.
            </p>
          </FormField>

          <FormField
            id={adminKeyId}
            label="Admin key (optional)"
            placeholder="Enter the sacred key for the infinite vault..."
            value={adminKey}
            onValueChange={(value, _isValid) => setAdminKey(value)}
            disabled={false}
          >
            <p className="text-xs text-gray-500 mt-1">
              Optional: Opens the infinite vault. Without it, you have 20MB
              limit.
            </p>
          </FormField>

          <FormField
            id={openaiKeyId}
            label="OpenAI API key"
            placeholder="Enter OpenAI's spell..."
            value={isOpenAIKeyDisabled ? openaiKeyDisplay : openaiApiKey}
            onValueChange={(value, _isValid) => setOpenaiApiKey(value)}
            disabled={isOpenAIKeyDisabled}
            tooltip={
              isOpenAIKeyDisabled ? (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p>Using stored API key. Contact administrator to reset.</p>
                </div>
              ) : (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="mb-2">
                    Seeking the power of OpenAI's arcane knowledge?
                  </p>
                  <ol className="list-decimal list-inside space-y-1 mb-2">
                    <li>
                      Journey to{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        platform.openai.com/api-keys
                      </a>
                    </li>
                    <li>Sign in or create an account</li>
                    <li>Click "Create new secret key"</li>
                    <li>Copy the key and paste it here</li>
                  </ol>
                  <p className="text-orange-600 dark:text-orange-400">
                    ⚠️ Guard your API key like a precious treasure - never share
                    it publicly.
                  </p>
                </div>
              )
            }
          />

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-center pt-4">
            <PrimaryActionButton
              type="submit"
              disabled={
                isLoading ||
                !currentUsername.trim() ||
                (!isOpenAIKeyDisabled && !openaiApiKey.trim())
              }
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Authenticating...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </PrimaryActionButton>
          </div>
        </form>

        <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <p className="font-medium mb-1">
            🔮 What awaits you beyond these gates?
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Your OpenAI API key will be safely stored in the vaults of
              LoreSmith
            </li>
            <li>Converse with wise AI agents about your grand campaigns</li>
            <li>Upload and manage documents for your adventures</li>
            <li>
              <strong>Storage Limits:</strong> 20MB for regular users, unlimited
              for admin users
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
