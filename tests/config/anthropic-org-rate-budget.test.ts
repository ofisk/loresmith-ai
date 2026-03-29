import { describe, expect, it } from "vitest";
import { deriveSubscriptionTierRates } from "@/config/anthropic-org-rate-budget";

describe("deriveSubscriptionTierRates", () => {
	it("keeps Pro at 2× Basic on rate limits", () => {
		const { free, basic, pro } = deriveSubscriptionTierRates();
		expect(pro.tph).toBe(basic.tph * 2);
		expect(pro.qph).toBe(basic.qph * 2);
		expect(pro.tpd).toBe(basic.tpd * 2);
		expect(pro.qpd).toBe(basic.qpd * 2);
		expect(free.tph).toBeLessThan(basic.tph);
		expect(free.qph).toBeLessThan(basic.qph);
	});

	it("produces positive limits", () => {
		const { basic } = deriveSubscriptionTierRates();
		expect(basic.tph).toBeGreaterThan(0);
		expect(basic.qph).toBeGreaterThan(0);
		expect(basic.tpd).toBeGreaterThan(0);
		expect(basic.qpd).toBeGreaterThan(0);
	});
});
