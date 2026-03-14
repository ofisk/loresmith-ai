import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseOrThrow } from "@/lib/zod-utils";

const TestSchema = z.object({
	name: z.string(),
	count: z.number(),
});

describe("parseOrThrow", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns parsed data when valid", () => {
		const data = { name: "test", count: 42 };
		const result = parseOrThrow(TestSchema, data);
		expect(result).toEqual(data);
	});

	it("throws when validation fails", () => {
		expect(() => parseOrThrow(TestSchema, { name: "x" })).toThrow();
	});

	it("uses messagePrefix when provided", () => {
		expect(() =>
			parseOrThrow(
				TestSchema,
				{ name: "x" },
				{
					messagePrefix: "Invalid input",
				}
			)
		).toThrow(/Invalid input/);
	});

	it("uses customError when provided", () => {
		class CustomError extends Error {
			constructor(m: string) {
				super(m);
				this.name = "CustomError";
			}
		}
		expect(() =>
			parseOrThrow(
				TestSchema,
				{ name: "x" },
				{
					customError: (msg) => new CustomError(msg),
				}
			)
		).toThrow(CustomError);
	});

	it("logs with logPrefix when validation fails", () => {
		expect.hasAssertions();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			parseOrThrow(
				TestSchema,
				{ name: "x" },
				{
					logPrefix: "[Test]",
				}
			);
		} catch {
			// expected
		}
		expect(warnSpy).toHaveBeenCalledWith(
			"[Test] Schema validation failed:",
			expect.anything()
		);
	});
});
