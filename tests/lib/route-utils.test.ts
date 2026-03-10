import { describe, expect, it, vi } from "vitest";
import { requireParam } from "@/lib/route-utils";

describe("requireParam", () => {
	it("returns param value when present", () => {
		const c = {
			req: {
				param: (key: string) => (key === "campaignId" ? "c123" : undefined),
			},
			json: (body: unknown, status?: number) =>
				({ body, status }) as unknown as Response,
		};
		const result = requireParam(c as any, "campaignId");
		expect(result).toBe("c123");
	});

	it("returns JSON response when param missing", () => {
		const jsonMock = vi.fn().mockReturnValue({} as Response);
		const c = {
			req: { param: () => undefined },
			json: jsonMock,
		};
		const result = requireParam(c as any, "campaignId");
		expect(result).not.toBe("c123");
		expect(jsonMock).toHaveBeenCalledWith(
			{ error: "campaignId is required" },
			400
		);
	});
});
