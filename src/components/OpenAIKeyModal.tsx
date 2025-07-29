import type React from "react";
import { useState } from "react";
import { Button } from "./button/Button";
import { Card } from "./card/Card";
import { Input } from "./input/Input";
import { Label } from "./label/Label";
import { Modal } from "./modal/Modal";

interface OpenAIKeyModalProps {
  isOpen: boolean;
  onSubmit: (apiKey: string) => Promise<void>;
  onClose?: () => void;
}

export function OpenAIKeyModal({
  isOpen,
  onSubmit,
  onClose,
}: OpenAIKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("Please enter your OpenAI API key");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onSubmit(apiKey.trim());
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set API key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyChange = (value: string) => {
    setApiKey(value);
    if (error) setError("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      clickOutsideToClose={false}
    >
      <Card className="w-full max-w-md mx-auto p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            OpenAI API Key Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Loresmith AI needs your OpenAI API key to function. This key is used
            to power the AI features and is stored securely.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label
              htmlFor="api-key"
              title="OpenAI API Key"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            />
            <div className="relative">
              <Input
                id="api-key"
                type={isKeyVisible ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="sk-..."
                className="pr-12"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIsKeyVisible(!isKeyVisible)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                disabled={isLoading}
              >
                {isKeyVisible ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="Hide password"
                  >
                    <title>Hide password</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="Show password"
                  >
                    <title>Show password</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {error}
              </p>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              How to get your API key:
            </h3>
            <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>
                1. Visit{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-800 dark:hover:text-blue-100"
                >
                  OpenAI Platform
                </a>
              </li>
              <li>2. Sign in or create an account</li>
              <li>3. Click "Create new secret key"</li>
              <li>4. Copy the key (starts with "sk-")</li>
            </ol>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading || !apiKey.trim()}
              className="min-w-[100px]"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Setting...</span>
                </div>
              ) : (
                "Set API Key"
              )}
            </Button>
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          Your API key is stored securely and only used for AI features. We
          never share your key with third parties.
        </div>
      </Card>
    </Modal>
  );
}
