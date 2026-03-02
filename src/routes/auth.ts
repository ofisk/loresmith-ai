import type { Context } from "hono";
import { jwtVerify } from "jose";
import { getDAOFactory } from "@/dao";
import { AgentRouter } from "@/lib/agent-router";
import { extractJwtFromHeader } from "@/lib/auth-utils";
import { getEnvVar } from "@/lib/env-utils";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getAuthService, LibraryRAGService } from "@/lib/service-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { AuthService } from "@/services/core/auth-service";
import { EmailService } from "@/services/core/email-service";
import {
	ALLOWED_RETURN_ORIGINS,
	API_CONFIG,
	DEFAULT_APP_ORIGIN,
	GOOGLE_OAUTH_URLS,
} from "@/shared-config";

// Helper to set user auth context
export function setUserAuth(c: Context, payload: AuthPayload) {
	(c as any).userAuth = payload;
}

// Middleware to require JWT for mutating endpoints
export async function requireUserJwt(
	c: Context,
	next: () => Promise<void>
): Promise<Response | undefined> {
	const authHeader = c.req.header("Authorization");
	const token = extractJwtFromHeader(authHeader);
	if (!token) {
		console.error("[requireUserJwt] Missing or invalid Authorization header");
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	try {
		const authService = getAuthService(c.env);
		const jwtSecret = await authService.getJwtSecret();
		const { payload } = await jwtVerify(token, jwtSecret);

		if (!payload || payload.type !== "user-auth") {
			console.error("[requireUserJwt] Invalid token payload");
			return c.json({ error: "Invalid token" }, 401);
		}

		// Attach user info to context
		setUserAuth(c, payload as AuthPayload);
		await next();
	} catch (err) {
		console.error("[requireUserJwt] JWT verification error:", err);
		return c.json({ error: "Invalid or expired token" }, 401);
	}
}

/** Optional JWT - attaches userAuth when valid token present, does not fail when absent */
export async function optionalUserJwt(
	c: Context,
	next: () => Promise<void>
): Promise<Response | void> {
	const authHeader = c.req.header("Authorization");
	const token = extractJwtFromHeader(authHeader);
	if (!token) {
		await next();
		return;
	}
	try {
		const authService = getAuthService(c.env);
		const jwtSecret = await authService.getJwtSecret();
		const { payload } = await jwtVerify(token, jwtSecret);
		if (payload && payload.type === "user-auth") {
			setUserAuth(c, payload as AuthPayload);
		}
	} catch (_err) {
		// Invalid token - continue without auth
	}
	await next();
}

// Agent routing functionality
export async function determineAgent(
	userMessage: string,
	messages: any[],
	env: any
): Promise<string> {
	// Get recent context for better routing
	const recentMessages = messages.slice(-6); // Last 6 messages
	const recentContext = recentMessages.map((msg) => msg.content).join(" ");

	// Get username from JWT for RAG service
	const lastUserMessage = messages
		.slice()
		.reverse()
		.find((msg) => msg.role === "user");

	const username = lastUserMessage
		? AuthService.extractUsernameFromMessage(lastUserMessage)
		: null;

	// Create LibraryRAGService if we have a username
	let ragService = null;
	if (username) {
		try {
			ragService = new LibraryRAGService(env);
		} catch (error) {
			console.warn("Failed to initialize LibraryRAGService:", error);
		}
	}

	const intent = await AgentRouter.routeMessage(
		userMessage,
		recentContext,
		ragService,
		null // We don't have the model here, so it will create a new one
	);

	console.log(
		`[AgentRouter] Routing to ${intent.agent} (confidence: ${intent.confidence}) - ${intent.reason}`
	);

	return intent.agent;
}

// --- Google OAuth ---

function isAllowedReturnUrl(returnUrl: string, appOrigin?: string): boolean {
	try {
		const origin = new URL(returnUrl).origin;
		if (ALLOWED_RETURN_ORIGINS.includes(origin)) return true;
		if (appOrigin && origin === new URL(appOrigin).origin) return true;
		return false;
	} catch {
		return false;
	}
}

export async function handleGoogleAuth(c: Context<{ Bindings: Env }>) {
	try {
		const returnUrl =
			c.req.query("return_url") || (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN);
		if (!isAllowedReturnUrl(returnUrl, c.env.APP_ORIGIN)) {
			return c.json({ error: "Invalid return URL" }, 400);
		}
		const clientId = await getEnvVar(c.env, "GOOGLE_OAUTH_CLIENT_ID", false);
		if (!clientId) {
			return c.json({ error: "Google sign-in is not configured" }, 503);
		}
		const callbackUrl = new URL(
			API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK,
			c.req.url
		).toString();
		const nonce = crypto.randomUUID();
		const state = `${nonce}.${encodeURIComponent(returnUrl)}`;
		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: callbackUrl,
			response_type: "code",
			scope: "openid email profile",
			state,
		});
		return c.redirect(`${GOOGLE_OAUTH_URLS.AUTH}?${params.toString()}`);
	} catch (error) {
		console.error("Google auth error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

export async function handleGoogleCallback(c: Context<{ Bindings: Env }>) {
	try {
		const code = c.req.query("code");
		const state = c.req.query("state");
		if (!code || !state) {
			return c.redirect(
				`${c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN}#error=missing_params`
			);
		}
		let returnUrl: string;
		try {
			const dot = state.indexOf(".");
			const url = dot >= 0 ? decodeURIComponent(state.slice(dot + 1)) : "";
			returnUrl = url || (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN);
		} catch {
			returnUrl = c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
		}
		if (!isAllowedReturnUrl(returnUrl, c.env.APP_ORIGIN)) {
			returnUrl = c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
		}
		const clientId = await getEnvVar(c.env, "GOOGLE_OAUTH_CLIENT_ID", false);
		const clientSecret = await getEnvVar(
			c.env,
			"GOOGLE_OAUTH_CLIENT_SECRET",
			false
		);
		if (!clientId || !clientSecret) {
			return c.redirect(`${returnUrl}#error=oauth_not_configured`);
		}
		const callbackUrl = new URL(
			API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK,
			c.req.url
		).toString();
		const tokenRes = await fetch(GOOGLE_OAUTH_URLS.TOKEN, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: callbackUrl,
				grant_type: "authorization_code",
			}),
		});
		if (!tokenRes.ok) {
			const err = await tokenRes.text();
			console.error("Google token exchange failed:", err);
			return c.redirect(`${returnUrl}#error=token_exchange_failed`);
		}
		const tokenJson = (await tokenRes.json()) as {
			id_token?: string;
			access_token?: string;
		};
		const userRes = await fetch(GOOGLE_OAUTH_URLS.USERINFO, {
			headers: {
				Authorization: `Bearer ${tokenJson.access_token ?? ""}`,
			},
		});
		if (!userRes.ok) {
			return c.redirect(`${returnUrl}#error=userinfo_failed`);
		}
		const userInfo = (await userRes.json()) as {
			id?: string;
			email?: string;
			name?: string;
		};
		const googleEmail = userInfo.email?.trim();
		const googleSub = userInfo.id ?? crypto.randomUUID();

		const dao = getDAOFactory(c.env);

		// Existing Google user who already chose a username: log in directly
		if (googleEmail) {
			const existingUser = await dao.authUserDAO.getUserByEmail(googleEmail);
			if (existingUser && existingUser.auth_provider === "google") {
				const authService = getAuthService(c.env);
				const result = await authService.authenticateUser({
					username: existingUser.username,
					isAdmin: !!existingUser.is_admin,
				});
				if (result.success && result.token) {
					return c.redirect(
						`${returnUrl}#token=${encodeURIComponent(result.token)}`
					);
				}
			}
		}

		if (!googleEmail) {
			return c.redirect(`${returnUrl}#error=email_required`);
		}
		const pendingToken = await AuthService.createGooglePendingToken(c.env, {
			email: googleEmail,
			sub: googleSub,
		});
		return c.redirect(
			`${returnUrl}#google_pending=${encodeURIComponent(pendingToken)}`
		);
	} catch (error) {
		console.error("Google callback error:", error);
		const returnUrl = (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN) as string;
		return c.redirect(`${returnUrl}#error=internal`);
	}
}

// --- Username/password: register, login, verify, resend ---

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** Reserved prefix for OAuth-derived usernames; password users cannot register usernames starting with this */
const OAUTH_USERNAME_PREFIX = "google_";

export async function handleGoogleCompleteSignup(
	c: Context<{ Bindings: Env }>
) {
	try {
		const body = (await c.req.json()) as {
			pendingToken?: string;
			username?: string;
		};
		const { pendingToken, username } = body;
		const trimmedUsername = username?.trim() ?? "";
		if (!pendingToken || !trimmedUsername) {
			return c.json({ error: "Pending token and username are required." }, 400);
		}
		const payload = await AuthService.verifyGooglePendingToken(
			c.env,
			pendingToken
		);
		if (!payload) {
			return c.json(
				{
					error:
						"Invalid or expired sign-in link. Please sign in with Google again.",
				},
				400
			);
		}
		if (
			!USERNAME_REGEX.test(trimmedUsername) ||
			trimmedUsername.toLowerCase().startsWith(OAUTH_USERNAME_PREFIX)
		) {
			return c.json(
				{
					error:
						"Username must be 2–64 characters (letters, numbers, _ or -) and cannot start with the reserved prefix.",
				},
				400
			);
		}
		const dao = getDAOFactory(c.env);
		const existingByUsername =
			await dao.authUserDAO.getUserByUsername(trimmedUsername);
		const existingByEmail = await dao.authUserDAO.getUserByEmail(payload.email);
		if (existingByUsername) {
			return c.json({ error: "Username is already taken." }, 409);
		}
		if (existingByEmail) {
			return c.json(
				{ error: "An account with this email already exists." },
				409
			);
		}
		const id = crypto.randomUUID();
		await dao.authUserDAO.createUser({
			id,
			username: trimmedUsername,
			email: payload.email,
			passwordHash: null,
			authProvider: "google",
			isAdmin: false,
		});
		await dao.authUserDAO.setEmailVerified(trimmedUsername);
		const authService = getAuthService(c.env);
		const result = await authService.authenticateUser({
			username: trimmedUsername,
			isAdmin: false,
		});
		if (!result.success || !result.token) {
			return c.json({ error: "Authentication failed." }, 500);
		}
		return c.json({ token: result.token });
	} catch (error) {
		console.error("Google complete signup error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

export async function handleRegister(c: Context<{ Bindings: Env }>) {
	try {
		const body = (await c.req.json()) as {
			username?: string;
			password?: string;
			email?: string;
		};
		const { username, password, email } = body;
		const trimmedUsername = username?.trim() ?? "";
		if (
			!username ||
			!password ||
			!email ||
			!USERNAME_REGEX.test(trimmedUsername) ||
			!EMAIL_REGEX.test(email.trim())
		) {
			return c.json(
				{
					error:
						"Username (2–64 chars, letters/numbers/_-), email, and password are required.",
				},
				400
			);
		}
		if (trimmedUsername.toLowerCase().startsWith(OAUTH_USERNAME_PREFIX)) {
			return c.json(
				{ error: "Username cannot start with the reserved prefix." },
				400
			);
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return c.json(
				{
					error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				},
				400
			);
		}
		const dao = getDAOFactory(c.env);
		const existingByUsername =
			await dao.authUserDAO.getUserByUsername(trimmedUsername);
		const existingByEmail = await dao.authUserDAO.getUserByEmail(email.trim());
		if (existingByUsername) {
			return c.json({ error: "Username is already taken." }, 409);
		}
		if (existingByEmail) {
			return c.json({ error: "Email is already registered." }, 409);
		}
		const passwordHash = await hashPassword(password);
		const id = crypto.randomUUID();
		await dao.authUserDAO.createUser({
			id,
			username: trimmedUsername,
			email: email.trim().toLowerCase(),
			passwordHash,
			authProvider: "password",
			isAdmin: false,
		});
		const token = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		await dao.authUserDAO.createVerificationToken(
			token,
			trimmedUsername,
			expiresAt
		);
		const apiOrigin = new URL(c.req.url).origin;
		const verificationLink = `${apiOrigin}/auth/verify-email?token=${encodeURIComponent(token)}`;
		const resendKey = await getEnvVar(c.env, "RESEND_API_KEY", false);
		const fromAddress =
			(await getEnvVar(c.env, "VERIFICATION_EMAIL_FROM", false)) ||
			"LoreSmith <noreply@loresmith.ai>";
		if (resendKey) {
			const emailService = new EmailService(resendKey);
			const sendResult = await emailService.sendVerificationEmail({
				to: email.trim().toLowerCase(),
				verificationLink,
				fromAddress,
			});
			if (!sendResult.ok) {
				console.error("Failed to send verification email:", sendResult.error);
			}
		}
		return c.json({
			success: true,
			message: "Check your email to verify your account.",
		});
	} catch (error) {
		console.error("Register error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

export async function handleLogin(c: Context<{ Bindings: Env }>) {
	try {
		const body = (await c.req.json()) as {
			username?: string;
			password?: string;
		};
		const { username, password } = body;
		if (!username || !password) {
			return c.json({ error: "Username and password are required." }, 400);
		}
		const dao = getDAOFactory(c.env);
		const user = await dao.authUserDAO.getUserByUsername(username.trim());
		if (!user) {
			return c.json({ error: "Invalid username or password." }, 401);
		}
		if (!user.password_hash) {
			return c.json(
				{ error: "This account uses Google sign-in. Use Sign in with Google." },
				400
			);
		}
		const valid = await verifyPassword(password, user.password_hash);
		if (!valid) {
			return c.json({ error: "Invalid username or password." }, 401);
		}
		if (!user.email_verified_at) {
			return c.json(
				{
					error: "Verify your email first.",
					code: "EMAIL_NOT_VERIFIED",
				},
				403
			);
		}
		const authService = getAuthService(c.env);
		const result = await authService.authenticateUser({
			username: user.username,
			isAdmin: !!user.is_admin,
		});
		if (!result.success || !result.token) {
			return c.json({ error: "Authentication failed." }, 500);
		}
		return c.json({ token: result.token });
	} catch (error) {
		console.error("Login error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

export async function handleVerifyEmail(c: Context<{ Bindings: Env }>) {
	try {
		const token = c.req.query("token");
		if (!token) {
			return c.redirect(
				`${(c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN}#verify=missing_token`
			);
		}
		const dao = getDAOFactory(c.env);
		const row = await dao.authUserDAO.getVerificationToken(token);
		const appOrigin = (c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN;
		if (!row) {
			return c.redirect(`${appOrigin}#verify=invalid_or_expired`);
		}
		await dao.authUserDAO.setEmailVerified(row.username);
		await dao.authUserDAO.deleteVerificationToken(token);
		const verifiedUser = await dao.authUserDAO.getUserByUsername(row.username);
		const authService = getAuthService(c.env);
		const result = await authService.authenticateUser({
			username: row.username,
			isAdmin: !!verifiedUser?.is_admin,
		});
		if (result.success && result.token) {
			return c.redirect(
				`${appOrigin}#token=${encodeURIComponent(result.token)}`
			);
		}
		return c.redirect(`${appOrigin}#verify=success`);
	} catch (error) {
		console.error("Verify email error:", error);
		const appOrigin = (c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN;
		return c.redirect(`${appOrigin}#verify=error`);
	}
}

export async function handleResendVerification(c: Context<{ Bindings: Env }>) {
	try {
		const body = (await c.req.json()) as {
			email?: string;
			username?: string;
		};
		const email = body.email?.trim().toLowerCase();
		const username = body.username?.trim();
		if (!email && !username) {
			return c.json(
				{ error: "Provide email or username to resend verification." },
				400
			);
		}
		const dao = getDAOFactory(c.env);
		const user = email
			? await dao.authUserDAO.getUserByEmail(email)
			: await dao.authUserDAO.getUserByUsername(username!);
		if (!user) {
			return c.json({
				success: true,
				message: "If that account exists, we sent an email.",
			});
		}
		if (user.email_verified_at) {
			return c.json({ success: true, message: "Account is already verified." });
		}
		await dao.authUserDAO.deleteVerificationTokensForUser(user.username);
		const token = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		await dao.authUserDAO.createVerificationToken(
			token,
			user.username,
			expiresAt
		);
		const apiOrigin = new URL(c.req.url).origin;
		const verificationLink = `${apiOrigin}/auth/verify-email?token=${encodeURIComponent(token)}`;
		const resendKey = await getEnvVar(c.env, "RESEND_API_KEY", false);
		const fromAddress =
			(await getEnvVar(c.env, "VERIFICATION_EMAIL_FROM", false)) ||
			"LoreSmith <noreply@loresmith.ai>";
		if (resendKey) {
			const emailService = new EmailService(resendKey);
			await emailService.sendVerificationEmail({
				to: user.email,
				verificationLink,
				fromAddress,
			});
		}
		return c.json({
			success: true,
			message: "If that account exists, we sent a verification email.",
		});
	} catch (error) {
		console.error("Resend verification error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/**
 * Logout endpoint - initiates client-side token cleanup
 *
 * This endpoint returns success to indicate logout was initiated server-side.
 * The client is responsible for clearing the JWT token from localStorage.
 * The client should call AuthService.clearJwt() to remove the token and dispatch
 * the jwt-changed event to notify other components.
 *
 * @see docs/AUTHENTICATION_FLOW.md for complete authentication flow documentation
 */
export async function handleLogout(c: Context<{ Bindings: Env }>) {
	try {
		// This endpoint just returns success - the client should clear local storage
		return c.json({
			success: true,
			message: "Logout successful. Please clear your browser's local storage.",
		});
	} catch (error) {
		console.error("Logout error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}
