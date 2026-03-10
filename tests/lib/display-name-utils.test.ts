import { describe, expect, it } from "vitest";
import { getDisplayName } from "@/lib/display-name-utils";

describe("getDisplayName", () => {
	it("returns display_name when present", () => {
		expect(
			getDisplayName({
				display_name: "Custom",
				file_name: "file.pdf",
				name: "x",
			})
		).toBe("Custom");
	});

	it("returns file_name when display_name is missing", () => {
		expect(getDisplayName({ file_name: "document.pdf" })).toBe("document.pdf");
	});

	it("returns name when display_name and file_name are missing", () => {
		expect(getDisplayName({ name: "Generic" })).toBe("Generic");
	});

	it("returns Unknown file when all are missing", () => {
		expect(getDisplayName({})).toBe("Unknown file");
	});

	it("prioritizes display_name over file_name and name", () => {
		expect(
			getDisplayName({
				display_name: "First",
				file_name: "Second",
				name: "Third",
			})
		).toBe("First");
	});
});
