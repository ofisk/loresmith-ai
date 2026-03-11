import { describe, expect, it } from "vitest";
import {
	customAlphabet,
	nanoid,
	default as nanoidModule,
} from "@/lib/nanoid/non-secure";

describe("nanoid non-secure", () => {
	it("nanoid returns string of default length 21", () => {
		const id = nanoid();
		expect(typeof id).toBe("string");
		expect(id).toHaveLength(21);
		expect(id).toMatch(/^[A-Za-z0-9]+$/);
	});

	it("nanoid with size returns string of that length", () => {
		const id = nanoid(10);
		expect(id).toHaveLength(10);
	});

	it("customAlphabet returns function that generates ids", () => {
		const custom = customAlphabet("abc", 5);
		const id = custom();
		expect(id).toHaveLength(5);
		expect(id).toMatch(/^[abc]+$/);
	});

	it("customAlphabet with size override", () => {
		const custom = customAlphabet("01", 10);
		const id = custom(3);
		expect(id).toHaveLength(3);
		expect(id).toMatch(/^[01]+$/);
	});

	it("default export has nanoid and customAlphabet", () => {
		expect(nanoidModule.nanoid).toBe(nanoid);
		expect(nanoidModule.customAlphabet).toBe(customAlphabet);
	});
});
