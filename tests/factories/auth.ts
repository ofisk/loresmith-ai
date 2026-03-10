import type { AuthPayload } from "../../src/services/core/auth-service";

/**
 * Create a type-checked auth payload (user) for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeAuthPayload(
	overrides: Partial<AuthPayload> = {}
): AuthPayload {
	return {
		type: "user-auth",
		username: "test-user",
		isAdmin: false,
		...overrides,
	};
}
