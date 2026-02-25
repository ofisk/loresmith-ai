import type React from "react";
import { useEffect, useId, useState } from "react";
import loresmith from "@/assets/loresmith.png";
import { API_CONFIG } from "@/shared-config";
import { PrimaryActionButton } from "./button";
import { FormField } from "./input/FormField";
import { Modal } from "./modal/Modal";

/** Which view the auth modal is showing: method picker, create-account form, sign-in form, or post-OAuth choose-username */
type AuthModalView = "choice" | "create" | "signin" | "google_username";

interface BlockingAuthenticationModalProps {
	isOpen: boolean;
	username?: string;
	/** When set, show "Choose your username" form to complete Google sign-in */
	googlePendingToken?: string | null;
	onLoginSuccess?: (token: string) => void | Promise<void>;
	onClose?: () => void;
}

export function BlockingAuthenticationModal({
	isOpen,
	googlePendingToken,
	onLoginSuccess,
}: BlockingAuthenticationModalProps) {
	const usernameId = useId();
	const emailId = useId();
	const passwordId = useId();
	const confirmPasswordId = useId();
	const [view, setView] = useState<AuthModalView>("choice");
	const [currentUsername, setCurrentUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [registerSuccess, setRegisterSuccess] = useState(false);
	const [emailNotVerified, setEmailNotVerified] = useState(false);
	const [resendLoading, setResendLoading] = useState(false);

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

	const googleAuthUrl = `${API_CONFIG.buildAuthUrl(API_CONFIG.ENDPOINTS.AUTH.GOOGLE)}?return_url=${encodeURIComponent(
		typeof window !== "undefined"
			? `${window.location.origin}${window.location.pathname}${window.location.search}`
			: ""
	)}`;

	const handleGoogleCompleteSignup = async (e?: React.SyntheticEvent) => {
		e?.preventDefault();
		if (!googlePendingToken || !onLoginSuccess) return;
		setError(null);
		setIsLoading(true);
		try {
			// OAuth auth routes live at origin (not under /api).
			const res = await fetch(
				API_CONFIG.buildAuthUrl(
					API_CONFIG.ENDPOINTS.AUTH.GOOGLE_COMPLETE_SIGNUP
				),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({
						pendingToken: googlePendingToken,
						username: currentUsername.trim(),
					}),
				}
			);

			const contentType = res.headers.get("content-type") ?? "";
			const data = contentType.includes("application/json")
				? ((await res.json().catch(() => null)) as null | {
						token?: string;
						error?: string;
					})
				: null;
			if (!res.ok) {
				if (data?.error) {
					setError(data.error);
					return;
				}

				// Avoid leaking low-level parse / fetch errors to users.
				setError("Sign-up failed. Please try again.");
				return;
			}
			if (data?.token) {
				await onLoginSuccess(data.token);
			}
		} catch {
			setError("Sign-up failed. Please try again.");
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
				API_CONFIG.buildAuthUrl(API_CONFIG.ENDPOINTS.AUTH.REGISTER),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: currentUsername.trim(),
						email: email.trim(),
						password,
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
				API_CONFIG.buildAuthUrl(API_CONFIG.ENDPOINTS.AUTH.LOGIN),
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
				API_CONFIG.buildAuthUrl(API_CONFIG.ENDPOINTS.AUTH.RESEND_VERIFICATION),
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

	// Mobile is full-screen; keep a fixed desktop size.
	const modalClassName =
		"w-full h-dvh rounded-none md:rounded-lg md:w-[600px] md:h-[600px]";

	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {}}
			clickOutsideToClose={false}
			showCloseButton={false}
			allowEscape={false}
			animatedBackground={true}
			fullScreenOnMobile={true}
			className={modalClassName}
		>
			<div className="p-4 md:p-6 max-w-md w-full mx-auto h-full overflow-y-auto flex flex-col md:justify-center">
				{view === "google_username" && googlePendingToken && (
					<>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							You signed in with Google. Choose a username to finish.
						</p>
						<div className="space-y-4">
							<FormField
								id={usernameId}
								label="Username"
								placeholder="2–64 characters, letters, numbers, _ or -"
								value={currentUsername}
								onValueChange={(v, _) => setCurrentUsername(v)}
								disabled={false}
								pattern=".*"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleGoogleCompleteSignup(e);
									}
								}}
							/>
							{error && <div className="text-red-500 text-sm">{error}</div>}
							<PrimaryActionButton
								type="button"
								onClick={() => {
									handleGoogleCompleteSignup();
								}}
								disabled={
									isLoading ||
									!currentUsername.trim() ||
									currentUsername.trim().length < 2
								}
							>
								{isLoading ? "Continuing…" : "Continue"}
							</PrimaryActionButton>
						</div>
					</>
				)}

				{view === "choice" && (
					<>
						<div className="mb-6">
							<div className="flex items-center gap-3 mb-4">
								<img
									src={loresmith}
									alt="LoreSmith"
									width={40}
									height={40}
									className="object-contain"
								/>
								<h3 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-br from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
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
						</div>
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
							<form onSubmit={handleRegister} noValidate className="space-y-4">
								<FormField
									id={usernameId}
									label="Username"
									placeholder="2–64 characters, letters, numbers, _ or -"
									value={currentUsername}
									onValueChange={(v, _) => setCurrentUsername(v)}
									disabled={false}
									pattern=".*"
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
								{error && <div className="text-red-500 text-sm">{error}</div>}
								<div className="flex gap-2">
									<PrimaryActionButton
										type="submit"
										formNoValidate
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
						<form onSubmit={handleLogin} noValidate className="space-y-4">
							<FormField
								id={usernameId}
								label="Username"
								placeholder="Your username"
								value={currentUsername}
								onValueChange={(v, _) => setCurrentUsername(v)}
								disabled={false}
								pattern=".*"
							/>
							<FormField
								id={passwordId}
								label="Password"
								placeholder="Your password"
								value={password}
								onValueChange={(v, _) => setPassword(v)}
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
									formNoValidate
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
			</div>
		</Modal>
	);
}
