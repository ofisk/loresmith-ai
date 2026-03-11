import { createRoute, z } from "@hono/zod-openapi";
import {
	ErrorResponseContent,
	GoogleCompleteSignupBodySchema,
	LoginBodySchema,
	RegisterBodySchema,
	ResendVerificationBodySchema,
	SuccessMessageSchema,
	TokenResponseSchema,
} from "@/routes/schemas/auth";
import { API_CONFIG } from "@/shared-config";
import { toApiRoutePath } from "../env";

const Error400 = {
	400: { content: ErrorResponseContent, description: "Bad request" },
} as const;
const Error401 = {
	401: { content: ErrorResponseContent, description: "Unauthorized" },
} as const;
const Error403 = {
	403: { content: ErrorResponseContent, description: "Forbidden" },
} as const;
const Error409 = {
	409: { content: ErrorResponseContent, description: "Conflict" },
} as const;
const Error500 = {
	500: { content: ErrorResponseContent, description: "Internal server error" },
} as const;

const Redirect302 = {
	302: { description: "Redirect to app or OAuth provider" },
} as const;

export const routeLogin = createRoute({
	method: "post",
	path: API_CONFIG.ENDPOINTS.AUTH.LOGIN,
	request: {
		body: {
			content: { "application/json": { schema: LoginBodySchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: TokenResponseSchema } },
			description: "Login successful",
		},
		...Error400,
		...Error401,
		...Error403,
		...Error500,
	},
});

export const routeRegister = createRoute({
	method: "post",
	path: API_CONFIG.ENDPOINTS.AUTH.REGISTER,
	request: {
		body: {
			content: { "application/json": { schema: RegisterBodySchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: SuccessMessageSchema } },
			description: "Registration successful",
		},
		...Error400,
		...Error409,
		...Error500,
	},
});

export const routeLogout = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.LOGOUT),
	responses: {
		200: {
			content: { "application/json": { schema: SuccessMessageSchema } },
			description: "Logout successful",
		},
		...Error500,
	},
});

export const routeResendVerification = createRoute({
	method: "post",
	path: API_CONFIG.ENDPOINTS.AUTH.RESEND_VERIFICATION,
	request: {
		body: {
			content: {
				"application/json": { schema: ResendVerificationBodySchema },
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: SuccessMessageSchema } },
			description: "Verification email sent or account already verified",
		},
		...Error400,
		...Error500,
	},
});

export const routeGoogleCompleteSignup = createRoute({
	method: "post",
	path: API_CONFIG.ENDPOINTS.AUTH.GOOGLE_COMPLETE_SIGNUP,
	request: {
		body: {
			content: {
				"application/json": { schema: GoogleCompleteSignupBodySchema },
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: TokenResponseSchema } },
			description: "Signup complete",
		},
		...Error400,
		...Error409,
		...Error500,
	},
});

export const routeVerifyEmail = createRoute({
	method: "get",
	path: API_CONFIG.ENDPOINTS.AUTH.VERIFY_EMAIL,
	request: {
		query: z.object({
			token: z.string().optional(),
		}),
	},
	responses: {
		...Redirect302,
	},
});

export const routeGoogleAuth = createRoute({
	method: "get",
	path: API_CONFIG.ENDPOINTS.AUTH.GOOGLE,
	responses: { ...Redirect302 },
});

export const routeGoogleCallback = createRoute({
	method: "get",
	path: API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK,
	request: {
		query: z
			.object({
				code: z.string().optional(),
				state: z.string().optional(),
				error: z.string().optional(),
			})
			.openapi("GoogleCallbackQuery"),
	},
	responses: { ...Redirect302 },
});
