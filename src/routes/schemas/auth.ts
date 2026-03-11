import { z } from "@hono/zod-openapi";
import { ErrorSchema } from "./common";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export const LoginBodySchema = z
	.object({
		username: z.string().min(1, "Username is required"),
		password: z.string().min(1, "Password is required"),
	})
	.openapi("LoginBody");

export const RegisterBodySchema = z
	.object({
		username: z
			.string()
			.regex(
				USERNAME_REGEX,
				"Username must be 2–64 characters (letters, numbers, _ or -)"
			),
		password: z.string().min(MIN_PASSWORD_LENGTH, "Password too short"),
		email: z.string().regex(EMAIL_REGEX, "Invalid email"),
	})
	.openapi("RegisterBody");

export const ResendVerificationBodySchema = z
	.object({
		email: z.string().email().optional(),
		username: z.string().min(1).optional(),
	})
	.refine((data) => !!data.email || !!data.username, {
		message: "Provide email or username to resend verification",
	})
	.openapi("ResendVerificationBody");

export const GoogleCompleteSignupBodySchema = z
	.object({
		pendingToken: z.string().min(1, "Pending token is required"),
		username: z
			.string()
			.regex(
				USERNAME_REGEX,
				"Username must be 2–64 characters (letters, numbers, _ or -)"
			),
	})
	.openapi("GoogleCompleteSignupBody");

export const TokenResponseSchema = z
	.object({ token: z.string() })
	.openapi("Token");

export const SuccessMessageSchema = z
	.object({
		success: z.literal(true),
		message: z.string(),
	})
	.openapi("SuccessMessage");

export const ErrorResponseContent = {
	"application/json": {
		schema: ErrorSchema,
	},
} as const;
