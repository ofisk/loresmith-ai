// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModalState } from "@/hooks/useModalState";

vi.mock("@/lib/logger", () => ({
	logger: {
		scope: () => ({
			debug: vi.fn(),
		}),
	},
}));

describe("useModalState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("initializes with closed modals", () => {
		const { result } = renderHook(() => useModalState());
		expect(result.current.showAuthModal).toBe(false);
		expect(result.current.isCreateCampaignModalOpen).toBe(false);
		expect(result.current.isCampaignDetailsModalOpen).toBe(false);
		expect(result.current.isAddResourceModalOpen).toBe(false);
		expect(result.current.isAddToCampaignModalOpen).toBe(false);
		expect(result.current.isEditFileModalOpen).toBe(false);
		expect(result.current.showRateLimitModal).toBe(false);
	});

	it("handleCreateCampaign opens create campaign modal", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleCreateCampaign());
		expect(result.current.isCreateCampaignModalOpen).toBe(true);
	});

	it("handleCreateCampaignClose closes modal and clears form", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleCreateCampaign());
		act(() => result.current.setCampaignName("Test"));
		act(() => result.current.setCampaignDescription("Desc"));
		act(() => result.current.handleCreateCampaignClose());
		expect(result.current.isCreateCampaignModalOpen).toBe(false);
		expect(result.current.campaignName).toBe("");
		expect(result.current.campaignDescription).toBe("");
	});

	it("handleAddResource opens add resource modal", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleAddResource());
		expect(result.current.isAddResourceModalOpen).toBe(true);
	});

	it("handleAddResourceClose clears selected campaigns", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleAddResource());
		act(() => result.current.setSelectedCampaigns(["c1"]));
		act(() => result.current.handleAddResourceClose());
		expect(result.current.isAddResourceModalOpen).toBe(false);
		expect(result.current.selectedCampaigns).toEqual([]);
	});

	it("handleAdminDashboardOpen opens admin modal", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleAdminDashboardOpen());
		expect(result.current.isAdminDashboardModalOpen).toBe(true);
	});

	it("showProposalConfirmModal sets legal notice and opens modal", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.showProposalConfirmModal("legal text"));
		expect(result.current.proposalConfirmLegalNotice).toBe("legal text");
		expect(result.current.isProposalConfirmModalOpen).toBe(true);
	});

	it("hideProposalConfirmModal closes and clears", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.showProposalConfirmModal("legal"));
		act(() => result.current.hideProposalConfirmModal());
		expect(result.current.isProposalConfirmModalOpen).toBe(false);
		expect(result.current.proposalConfirmLegalNotice).toBe("");
	});

	it("showRateLimitReachedModal sets reason and nextResetAt", () => {
		const { result } = renderHook(() => useModalState());
		act(() =>
			result.current.showRateLimitReachedModal("quota", "2025-01-15T00:00:00Z")
		);
		expect(result.current.showRateLimitModal).toBe(true);
		expect(result.current.rateLimitReason).toBe("quota");
		expect(result.current.rateLimitNextResetAt).toBe("2025-01-15T00:00:00Z");
	});

	it("hideRateLimitModal clears rate limit state", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.showRateLimitReachedModal("reason", "reset"));
		act(() => result.current.hideRateLimitModal());
		expect(result.current.showRateLimitModal).toBe(false);
		expect(result.current.rateLimitNextResetAt).toBe(null);
		expect(result.current.rateLimitReason).toBeUndefined();
	});

	it("handleUsageLimitsOpen and handleUsageLimitsClose", () => {
		const { result } = renderHook(() => useModalState());
		act(() => result.current.handleUsageLimitsOpen());
		expect(result.current.showUsageLimitsModal).toBe(true);
		act(() => result.current.handleUsageLimitsClose());
		expect(result.current.showUsageLimitsModal).toBe(false);
	});

	it("showQuotaWarningModalFn and hideQuotaWarningModal", () => {
		const { result } = renderHook(() => useModalState());
		act(() =>
			result.current.showQuotaWarningModalFn({
				reason: "limit reached",
				monthlyUsage: 100,
				monthlyLimit: 100,
			})
		);
		expect(result.current.showQuotaWarningModal).toBe(true);
		expect(result.current.quotaWarningPayload).toEqual({
			reason: "limit reached",
			monthlyUsage: 100,
			monthlyLimit: 100,
		});
		act(() => result.current.hideQuotaWarningModal());
		expect(result.current.showQuotaWarningModal).toBe(false);
		expect(result.current.quotaWarningPayload).toBe(null);
	});
});
