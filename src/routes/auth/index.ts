import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";
import {
	handleGoogleAuth,
	handleGoogleCallback,
	handleGoogleCompleteSignup,
	handleLogin,
	handleLogout,
	handleRegister,
	handleResendVerification,
	handleVerifyEmail,
} from "../auth";

export function registerAuthRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.LOGOUT), handleLogout);
	// Auth OAuth routes at root (not under /api)
	app.get(API_CONFIG.ENDPOINTS.AUTH.GOOGLE, handleGoogleAuth);
	app.get(API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK, handleGoogleCallback);
	app.post(
		API_CONFIG.ENDPOINTS.AUTH.GOOGLE_COMPLETE_SIGNUP,
		handleGoogleCompleteSignup
	);
	app.post(API_CONFIG.ENDPOINTS.AUTH.REGISTER, handleRegister);
	app.post(API_CONFIG.ENDPOINTS.AUTH.LOGIN, handleLogin);
	app.get(API_CONFIG.ENDPOINTS.AUTH.VERIFY_EMAIL, handleVerifyEmail);
	app.post(
		API_CONFIG.ENDPOINTS.AUTH.RESEND_VERIFICATION,
		handleResendVerification
	);
}
