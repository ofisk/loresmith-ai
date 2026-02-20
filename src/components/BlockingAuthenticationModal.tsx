import type React from "react";
import { useEffect, useId, useState } from "react";
import { PrimaryActionButton } from "./button";
import { FormField } from "./input/FormField";
import { Modal } from "./modal/Modal";
import { API_CONFIG } from "@/shared-config";
import loresmith from "@/assets/loresmith.png";

/** Which view the auth modal is showing: method picker, create-account form, sign-in form, legacy API-key form, or Google choose-username */
type AuthModalView =
  | "choice"
  | "create"
  | "signin"
  | "legacy"
  | "google_username";

interface BlockingAuthenticationModalProps {
  isOpen: boolean;
  username?: string;
  storedOpenAIKey?: string;
  /** When set, show "Choose your username" form to complete Google sign-in */
  googlePendingToken?: string | null;
  onSubmit: (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => Promise<void>;
  onLoginSuccess?: (token: string) => void | Promise<void>;
  onClose?: () => void;
}

export function BlockingAuthenticationModal({
  isOpen,
  storedOpenAIKey,
  googlePendingToken,
  onSubmit,
  onLoginSuccess,
}: BlockingAuthenticationModalProps) {
  const usernameId = useId();
  const adminKeyId = useId();
  const openaiKeyId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [view, setView] = useState<AuthModalView>("choice");
  const [currentUsername, setCurrentUsername] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (storedOpenAIKey && isOpen) {
      setOpenaiApiKey(storedOpenAIKey);
    }
  }, [storedOpenAIKey, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setRegisterSuccess(false);
      setEmailNotVerified(false);
    }
  }, [isOpen]);

  // When we have a Google pending token, show the choose-username view
  useEffect(() => {
    if (isOpen && googlePendingToken) {
      setView("google_username");
      setCurrentUsername("");
      setError(null);
    }
  }, [isOpen, googlePendingToken]);

  const googleAuthUrl = `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.GOOGLE)}?return_url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}`;

  const handleGoogleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googlePendingToken || !onLoginSuccess) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.GOOGLE_COMPLETE_SIGNUP),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingToken: googlePendingToken,
            username: currentUsername.trim(),
          }),
        }
      );
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-up failed");
        return;
      }
      if (data.token) {
        await onLoginSuccess(data.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitLegacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Connection timeout. Please check if the server is running."
              )
            ),
          30000
        )
      );
      await Promise.race([
        onSubmit(currentUsername, adminKey, openaiApiKey),
        timeoutPromise,
      ]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.REGISTER),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUsername.trim(),
            email: email.trim(),
            password,
            ...(openaiApiKey.trim() && { openaiApiKey: openaiApiKey.trim() }),
          }),
        }
      );
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }
      setRegisterSuccess(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailNotVerified(false);
    setIsLoading(true);
    try {
      const res = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.LOGIN),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUsername.trim(),
            password,
          }),
        }
      );
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        token?: string;
      };
      if (res.ok && data.token && onLoginSuccess) {
        if (openaiApiKey.trim()) {
          try {
            await fetch(
              API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.STORE_OPENAI_KEY),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: currentUsername.trim(),
                  apiKey: openaiApiKey.trim(),
                }),
              }
            );
          } catch {
            // Key is optional; still let user in
          }
        }
        await onLoginSuccess(data.token);
        return;
      }
      if (res.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
        setError(data.error ?? "Verify your email first.");
        return;
      }
      setError(data.error ?? "Sign in failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim() && !currentUsername.trim()) {
      setError("Enter your email or username to resend.");
      return;
    }
    setResendLoading(true);
    setError(null);
    try {
      const res = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.RESEND_VERIFICATION),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim() || undefined,
            username: currentUsername.trim() || undefined,
          }),
        }
      );
      const data = (await res.json()) as { error?: string; message?: string };
      if (res.ok) {
        setError(null);
        setEmailNotVerified(false);
        setRegisterSuccess(true);
      } else {
        setError(data.error ?? "Could not resend email.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend.");
    } finally {
      setResendLoading(false);
    }
  };

  const isOpenAIKeyDisabled = !!storedOpenAIKey;
  const openaiKeyDisplay = storedOpenAIKey
    ? `${storedOpenAIKey.substring(0, 8)}...${storedOpenAIKey.substring(storedOpenAIKey.length - 4)}`
    : "";

  // Dynamic modal size based on view - legacy view needs more height
  const modalSize =
    view === "legacy"
      ? { width: 600, height: 750 }
      : { width: 600, height: 600 };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      clickOutsideToClose={false}
      showCloseButton={false}
      allowEscape={false}
      animatedBackground={true}
      cardStyle={modalSize}
    >
      <div className="p-6 max-w-md mx-auto flex flex-col justify-center min-h-full">
        {view === "google_username" && googlePendingToken && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              You signed in with Google. Choose a username to finish.
            </p>
            <form onSubmit={handleGoogleCompleteSignup} className="space-y-4">
              <FormField
                id={usernameId}
                label="Username"
                placeholder="2–64 characters, letters, numbers, _ or -"
                value={currentUsername}
                onValueChange={(v, _) => setCurrentUsername(v)}
                disabled={false}
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <PrimaryActionButton
                type="submit"
                disabled={
                  isLoading ||
                  !currentUsername.trim() ||
                  currentUsername.trim().length < 2
                }
              >
                {isLoading ? "Continuing…" : "Continue"}
              </PrimaryActionButton>
            </form>
          </>
        )}

        {view === "choice" && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={loresmith}
                  alt="LoreSmith"
                  width={48}
                  height={48}
                  className="object-contain"
                />
                <h3 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Welcome to LoreSmith
                </h3>
              </div>
              <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                Create rich campaign worlds, collaborate with AI, and bring your
                stories to life
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Sign in with Google or use a username and password.
            </p>
            <div className="space-y-3">
              <a
                href={googleAuthUrl}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Sign in with Google
              </a>
              <button
                type="button"
                onClick={() => setView("create")}
                className="w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setView("signin")}
                className="w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setView("legacy")}
                className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:underline"
              >
                Use API key instead
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              You can provide your own OpenAI API key when signing in or via the
              API key option above.
            </p>
          </>
        )}

        {view === "create" && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Create an account with username and email. We’ll send a
              verification link.
            </p>
            {registerSuccess ? (
              <div className="space-y-3">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Check your email to verify your account.
                </p>
                <button
                  type="button"
                  onClick={() => setView("signin")}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("choice");
                    setRegisterSuccess(false);
                  }}
                  className="block text-sm text-gray-500 hover:underline"
                >
                  Back
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <FormField
                  id={usernameId}
                  label="Username"
                  placeholder="2–64 characters, letters, numbers, _ or -"
                  value={currentUsername}
                  onValueChange={(v, _) => setCurrentUsername(v)}
                  disabled={false}
                />
                <FormField
                  id={emailId}
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onValueChange={(v, _) => setEmail(v)}
                  disabled={false}
                />
                <FormField
                  id={passwordId}
                  label="Password"
                  placeholder="At least 8 characters"
                  value={password}
                  onValueChange={(v, _) => setPassword(v)}
                  disabled={false}
                />
                <FormField
                  id={confirmPasswordId}
                  label="Confirm password"
                  placeholder="Same as above"
                  value={confirmPassword}
                  onValueChange={(v, _) => setConfirmPassword(v)}
                  disabled={false}
                />
                <FormField
                  id={openaiKeyId}
                  label="OpenAI API key (optional)"
                  placeholder="Add your key to use AI features"
                  value={openaiApiKey}
                  onValueChange={(v, _) => setOpenaiApiKey(v)}
                  disabled={false}
                />
                {error && <div className="text-red-500 text-sm">{error}</div>}
                <div className="flex gap-2">
                  <PrimaryActionButton
                    type="submit"
                    disabled={
                      isLoading ||
                      !currentUsername.trim() ||
                      !email.trim() ||
                      password.length < 8 ||
                      password !== confirmPassword
                    }
                  >
                    {isLoading ? "Creating…" : "Create account"}
                  </PrimaryActionButton>
                  <button
                    type="button"
                    onClick={() => setView("choice")}
                    className="py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {view === "signin" && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Sign in with your username and password.
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <FormField
                id={usernameId}
                label="Username"
                placeholder="Your username"
                value={currentUsername}
                onValueChange={(v, _) => setCurrentUsername(v)}
                disabled={false}
              />
              <FormField
                id={passwordId}
                label="Password"
                placeholder="Your password"
                value={password}
                onValueChange={(v, _) => setPassword(v)}
                disabled={false}
              />
              <FormField
                id={openaiKeyId}
                label="OpenAI API key (optional)"
                placeholder="Add your key to use AI features"
                value={openaiApiKey}
                onValueChange={(v, _) => setOpenaiApiKey(v)}
                disabled={false}
              />
              {emailNotVerified && (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  Verify your email first.{" "}
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading}
                    className="underline"
                  >
                    {resendLoading ? "Sending…" : "Resend verification email"}
                  </button>
                </div>
              )}
              {error && !emailNotVerified && (
                <div className="text-red-500 text-sm">{error}</div>
              )}
              <div className="flex gap-2">
                <PrimaryActionButton
                  type="submit"
                  disabled={isLoading || !currentUsername.trim() || !password}
                >
                  {isLoading ? "Signing in…" : "Sign in"}
                </PrimaryActionButton>
                <button
                  type="button"
                  onClick={() => setView("choice")}
                  className="py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Back
                </button>
              </div>
            </form>
          </>
        )}

        {view === "legacy" && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Present your credentials to enter the halls of LoreSmith. You'll
              need your own OpenAI API key to unlock these ancient gates.
              Providing the sacred admin key grants unlimited storage access.
            </p>
            <form onSubmit={handleSubmitLegacy} className="space-y-4">
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
                      <p>
                        Using stored API key. Contact administrator to reset.
                      </p>
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
                        ⚠️ Guard your API key like a precious treasure - never
                        share it publicly.
                      </p>
                    </div>
                  )
                }
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <div className="flex justify-center pt-4 gap-2">
                <PrimaryActionButton
                  type="submit"
                  disabled={
                    isLoading ||
                    !currentUsername.trim() ||
                    (!isOpenAIKeyDisabled && !openaiApiKey.trim())
                  }
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    "Sign In"
                  )}
                </PrimaryActionButton>
                <button
                  type="button"
                  onClick={() => setView("choice")}
                  className="py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Back
                </button>
              </div>
            </form>

            <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <p className="font-medium mb-1">
                🔮 What awaits you beyond these gates?
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Your OpenAI API key can be stored in the vaults of LoreSmith
                </li>
                <li>Converse with wise AI agents about your grand campaigns</li>
                <li>Upload and manage documents for your adventures</li>
                <li>
                  <strong>Storage Limits:</strong> 20MB for regular users,
                  unlimited for admin users
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
