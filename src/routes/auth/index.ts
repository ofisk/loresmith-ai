import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	handleGoogleAuth,
	handleGoogleCallback,
	handleGoogleCompleteSignup,
	handleLogin,
	handleLogout,
	handleRegister,
	handleResendVerification,
	handleVerifyEmail,
} from "@/routes/auth";
import {
	routeGoogleAuth,
	routeGoogleCallback,
	routeGoogleCompleteSignup,
	routeLogin,
	routeLogout,
	routeRegister,
	routeResendVerification,
	routeVerifyEmail,
} from "@/routes/auth/routes";
import type { Env } from "@/routes/env";

export function registerAuthRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeLogout, handleLogout as Handler);
	app.openapi(routeGoogleAuth, handleGoogleAuth as Handler);
	app.openapi(routeGoogleCallback, handleGoogleCallback as Handler);
	app.openapi(routeGoogleCompleteSignup, handleGoogleCompleteSignup as Handler);
	app.openapi(routeRegister, handleRegister as Handler);
	app.openapi(routeLogin, handleLogin as Handler);
	app.openapi(routeVerifyEmail, handleVerifyEmail as Handler);
	app.openapi(routeResendVerification, handleResendVerification as Handler);
}
