import type React from "react";
import { useState, useEffect } from "react";
import { Modal } from "./modal/Modal";
import { Button } from "./button/Button";
import { Input } from "./input/Input";
import { Label } from "./label/Label";

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
  onClose,
}: BlockingAuthenticationModalProps) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onSubmit(currentUsername, adminKey, openaiApiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
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
      onClose={onClose || (() => {})}
      clickOutsideToClose={false}
    >
      <div className="p-6 max-w-md mx-auto">
        <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Present your credentials to enter the halls of LoreSmith. You'll need
          the sacred admin key and your own OpenAI API key to unlock these
          ancient gates.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username" title="Username" required></Label>
            <Input
              id="username"
              type="text"
              value={currentUsername}
              onChange={(e) => setCurrentUsername(e.target.value)}
              placeholder="Speak your name..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Forge your identity in the realm of LoreSmith.
            </p>
          </div>

          <div>
            <Label htmlFor="adminKey" title="Admin Key" required></Label>
            <Input
              id="adminKey"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter the sacred key..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Seek the administrator for the key to unlock these halls.
            </p>
          </div>

          <div>
            <Label htmlFor="openaiKey" title="OpenAI API Key" required></Label>
            <Input
              id="openaiKey"
              type="password"
              value={isOpenAIKeyDisabled ? openaiKeyDisplay : openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="Enter OpenAI's spell..."
              disabled={isOpenAIKeyDisabled}
              required
            />
            {isOpenAIKeyDisabled ? (
              <p className="text-sm text-gray-500 mt-1">
                Using stored API key. Contact administrator to reset.
              </p>
            ) : (
              <div className="text-xs text-gray-500 mt-1">
                <p>Seeking the power of OpenAI's arcane knowledge?</p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>
                    Journey to{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      platform.openai.com/api-keys
                    </a>
                  </li>
                  <li>Sign in or create an account</li>
                  <li>Click "Create new secret key"</li>
                  <li>Copy the key and paste it here</li>
                </ol>
                <p className="mt-2 text-orange-600 dark:text-orange-400">
                  ⚠️ Guard your API key like a precious treasure - never share
                  it publicly.
                </p>
              </div>
            )}
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              disabled={
                isLoading ||
                !adminKey.trim() ||
                (!isOpenAIKeyDisabled && !openaiApiKey.trim())
              }
              className="min-w-[100px]"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Authenticating...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
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
            <li>
              Upload and manage ancient scrolls (PDFs) for your D&D adventures
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
