import { describe, expect, it } from "vitest";
import { customAlphabet, nanoid } from "@/lib/nanoid/index";

describe("nanoid", () => {
	it("returns string of default length 21", () => {
		const id = nanoid();
		expect(typeof id).toBe("string");
		expect(id.length).toBe(21);
	});

	it("returns string of custom length", () => {
		const id = nanoid(10);
		expect(id.length).toBe(10);
	});

	it("returns alphanumeric chars only", () => {
		const id = nanoid(50);
		expect(id).toMatch(/^[A-Za-z0-9]+$/);
	});
});

describe("customAlphabet", () => {
	it("returns function that generates id with custom alphabet", () => {
		const gen = customAlphabet("ab", 5);
		const id = gen();
		expect(id.length).toBe(5);
		expect(id).toMatch(/^[ab]+$/);
	});

	it("accepts custom size", () => {
		const gen = customAlphabet("01", 10);
		const id = gen(3);
		expect(id.length).toBe(3);
		expect(id).toMatch(/^[01]+$/);
	});
});
