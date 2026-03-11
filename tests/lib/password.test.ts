import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
	it("hashPassword returns a hash string", async () => {
		const hash = await hashPassword("mypassword");
		expect(typeof hash).toBe("string");
		expect(hash).not.toBe("mypassword");
		expect(hash.length).toBeGreaterThan(10);
	});

	it("verifyPassword returns true for correct password", async () => {
		const hash = await hashPassword("secret123");
		const ok = await verifyPassword("secret123", hash);
		expect(ok).toBe(true);
	});

	it("verifyPassword returns false for wrong password", async () => {
		const hash = await hashPassword("secret123");
		const ok = await verifyPassword("wrong", hash);
		expect(ok).toBe(false);
	});
});
