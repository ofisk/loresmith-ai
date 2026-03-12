import { describe, expect, it } from "vitest";
import { noOpTool } from "@/tools/common/no-op-tool";

describe("noOpTool", () => {
	it("execute returns success with reason", async () => {
		const result = await noOpTool.execute(
			{ reason: "Answering a general question" },
			{} as any
		);

		expect(result).toMatchObject({
			result: {
				success: true,
				data: { optedOut: true, reason: "Answering a general question" },
			},
		});
		expect(JSON.stringify(result)).toContain("No tool needed:");
	});
});
