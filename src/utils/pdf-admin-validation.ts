/**
 * PDF Admin Secret Validation Utilities
 *
 * Re-exports generic admin validation utilities with PDF-specific error messages.
 * This maintains backward compatibility while using the generic admin validation logic.
 *
 * For new features, consider importing directly from "./admin-validation" instead.
 * This file exists primarily for backward compatibility with existing PDF routes.
 *
 * All functions are identical to those in admin-validation.ts but with PDF-specific error messages:
 * - validateAdminSecretFromHeader
 * - validateAdminSecretFromBody
 * - createAdminSecretErrorResponse
 * - validateAdminSecretOrFail
 * - AdminSecretValidationResult interface
 */

import type { Context } from "hono";
import {
  type AdminSecretValidationOptions,
  type AdminSecretValidationResult,
  createAdminSecretErrorResponse,
  validateAdminSecretFromBody as genericValidateAdminSecretFromBody,
  validateAdminSecretFromHeader as genericValidateAdminSecretFromHeader,
  validateAdminSecretOrFail as genericValidateAdminSecretOrFail,
} from "./admin-validation";

// PDF-specific error message constants
const PDF_ADMIN_OPTIONS: AdminSecretValidationOptions = {
  missingSecretMessage:
    "Admin secret required. Please provide X-Admin-Secret header for PDF operations.",
  notConfiguredMessage: "PDF upload not configured. Admin secret not set.",
  unauthorizedMessage: "Unauthorized. Invalid admin secret for PDF operations.",
};

/**
 * Validate admin secret from request headers with PDF-specific error messages
 */
export function validateAdminSecretFromHeader(
  c: Context,
  env: { ADMIN_SECRET?: string }
): AdminSecretValidationResult {
  return genericValidateAdminSecretFromHeader(c, env, PDF_ADMIN_OPTIONS);
}

/**
 * Validate admin secret from request body with PDF-specific error messages
 */
export function validateAdminSecretFromBody(
  body: { adminSecret?: string },
  env: { ADMIN_SECRET?: string }
): AdminSecretValidationResult {
  return genericValidateAdminSecretFromBody(body, env, PDF_ADMIN_OPTIONS);
}

/**
 * Validate admin secret and return early if invalid with PDF-specific error messages
 */
export function validateAdminSecretOrFail(
  c: Context,
  env: { ADMIN_SECRET?: string }
): string {
  return genericValidateAdminSecretOrFail(c, env, PDF_ADMIN_OPTIONS);
}

// Re-export the error response function and types
export { createAdminSecretErrorResponse, type AdminSecretValidationResult };
