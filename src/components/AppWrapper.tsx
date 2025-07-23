import { useOpenAIKey } from "../hooks/useOpenAIKey";
import { OpenAIKeyModal } from "./OpenAIKeyModal";
import Chat from "../app";

export function AppWrapper() {
  const { hasApiKey, isLoading: isApiKeyLoading, setApiKey } = useOpenAIKey();

  // Show API key modal if no API key is available
  const showApiKeyModal = !isApiKeyLoading && !hasApiKey;

  return (
    <>
      <Chat />
      <OpenAIKeyModal isOpen={showApiKeyModal} onSubmit={setApiKey} />
    </>
  );
}
