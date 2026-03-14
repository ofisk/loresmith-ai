/**
 * Shared type utilities for stricter typing across the codebase.
 */

/** SQL bind parameters for D1 (string, number, null, boolean). Use null, not undefined, for SQL NULL. */
export type SqlParam = string | number | null | boolean;

/** Params passed to query/execute; undefined is converted to null when binding. Mutable for building. */
export type SqlParams = (SqlParam | undefined)[];

/** Params accepted by base-dao (readonly for input) */
export type SqlParamsInput = readonly (SqlParam | undefined)[];

/** Extract DAO methods for mocking (pick only function properties) */
export type DaoMethods<T> = Pick<
	T,
	Extract<
		{
			[K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
		}[keyof T],
		keyof T
	>
>;

/** Discriminated API result (alternative to ApiResponse) */
export type Result<T, E = string> =
	| { ok: true; data: T }
	| { ok: false; error: E };
