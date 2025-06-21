/**
 * Admin Secret Validation Utilities
 *
 * Generic utilities for validating admin secrets in API routes and tools.
 * This reduces code duplication and centralizes admin secret validation logic.
 * Can be reused by any feature that requires admin authentication.
 *
 * Usage:
 * - Import directly: import { validateAdminSecretFromHeader } from "./utils/admin-validation"
 * - Import from feature-specific files: import { validateAdminSecretFromHeader } from "./utils/pdf-admin-validation"
 *
 * Features:
 * - Header-based validation (X-Admin-Secret header)
 * - Body-based validation (adminSecret field in request body)
 * - Error response generation
 * - Convenience functions for route handlers
 * - Customizable error messages for feature-specific contexts
 *
 * Environment Variable:
 * - ADMIN_SECRET: The secret key required for admin authentication
 *
 * Examples:
 *
 * Basic usage:
 * ```typescript
 * // In a route handler
 * const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
 * if (!adminSecretValidation.isValid) {
 *   return createAdminSecretErrorResponse(adminSecretValidation);
 * }
 * ```
 *
 * With custom error messages:
 * ```typescript
 * // For PDF operations
 * const adminSecretValidation = validateAdminSecretFromHeader(c, c.env, {
 *   notConfiguredMessage: "PDF upload not configured. Admin secret not set.",
 *   unauthorizedMessage: "Unauthorized. Invalid admin secret for PDF operations."
 * });
 *
 * // For user management operations
 * const adminSecretValidation = validateAdminSecretFromHeader(c, c.env, {
 *   notConfiguredMessage: "User management not configured. Admin secret not set.",
 *   unauthorizedMessage: "Unauthorized. Invalid admin secret for user management."
 * });
 *
 * // For system configuration operations
 * const adminSecretValidation = validateAdminSecretFromHeader(c, c.env, {
 *   notConfiguredMessage: "System configuration not available. Admin secret not set.",
 *   unauthorizedMessage: "Unauthorized. Invalid admin secret for system configuration."
 * });
 * ```
 */

import type { Context } from "hono";

export interface AdminSecretValidationResult {
  isValid: boolean;
  adminSecret?: string;
  error?: string;
}

export interface AdminSecretValidationOptions {
  missingSecretMessage?: string;
  notConfiguredMessage?: string;
  unauthorizedMessage?: string;
}

/**
 * Validate admin secret from request headers
 */
export function validateAdminSecretFromHeader(
  c: Context,
  env: { ADMIN_SECRET?: string },
  options: AdminSecretValidationOptions = {}
): AdminSecretValidationResult {
  const {
    notConfiguredMessage = "Admin functionality not configured. Admin secret not set.",
    unauthorizedMessage = "Unauthorized. Invalid admin secret.",
    missingSecretMessage = "Admin secret required. Please provide X-Admin-Secret header.",
  } = options;

  const adminSecret = c.req.header("X-Admin-Secret");

  if (!adminSecret) {
    return {
      isValid: false,
      error: missingSecretMessage,
    };
  }

  if (!env.ADMIN_SECRET) {
    return {
      isValid: false,
      error: notConfiguredMessage,
    };
  }

  if (adminSecret !== env.ADMIN_SECRET) {
    return {
      isValid: false,
      error: unauthorizedMessage,
    };
  }

  return {
    isValid: true,
    adminSecret,
  };
}

/**
 * Validate admin secret from request body
 */
export function validateAdminSecretFromBody(
  body: { adminSecret?: string },
  env: { ADMIN_SECRET?: string },
  options: AdminSecretValidationOptions = {}
): AdminSecretValidationResult {
  const {
    notConfiguredMessage = "Admin functionality not configured. Admin secret not set.",
    unauthorizedMessage = "Unauthorized. Invalid admin secret.",
    missingSecretMessage = "Admin secret required. Please provide adminSecret in request body.",
  } = options;

  const { adminSecret } = body;

  if (!adminSecret) {
    return {
      isValid: false,
      error: missingSecretMessage,
    };
  }

  if (!env.ADMIN_SECRET) {
    return {
      isValid: false,
      error: notConfiguredMessage,
    };
  }

  if (adminSecret !== env.ADMIN_SECRET) {
    return {
      isValid: false,
      error: unauthorizedMessage,
    };
  }

  return {
    isValid: true,
    adminSecret,
  };
}

/**
 * Create an error response for admin secret validation failures
 */
export function createAdminSecretErrorResponse(
  result: AdminSecretValidationResult,
  status = 401
) {
  return new Response(
    JSON.stringify({
      error: result.error || "Admin secret validation failed",
      status: "error",
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Validate admin secret and return early if invalid
 * This is a convenience function for route handlers
 */
export function validateAdminSecretOrFail(
  c: Context,
  env: { ADMIN_SECRET?: string },
  options: AdminSecretValidationOptions = {}
): string {
  const result = validateAdminSecretFromHeader(c, env, options);

  if (!result.isValid) {
    throw new Error(result.error || "Admin secret validation failed");
  }

  return result.adminSecret!;
}
