// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppOrchestration } from "@/hooks/useAppOrchestration";

vi.mock("@/contexts/ActionQueueContext", () => ({
	useActionQueue: () => ({ addToQueue: vi.fn() }),
}));

vi.mock("@/hooks/useCampaigns", () => ({
	useCampaigns: () => ({
		createCampaign: vi.fn(),
		campaigns: [],
		selectedCampaignId: null,
		selectedCampaign: null,
		setSelectedCampaignId: vi.fn(),
		refetch: vi.fn(),
	}),
}));

vi.mock("@/hooks/useBillingStatus", () => ({
	useBillingStatus: () => ({ data: null }),
}));

vi.mock("@/hooks/useLocalNotifications", () => ({
	useLocalNotifications: () => ({
		allNotifications: [],
		addLocalNotification: vi.fn(),
		dismissNotification: vi.fn(),
		clearAllNotifications: vi.fn(),
	}),
}));

vi.mock("@/hooks/useCampaignAddition", () => ({
	useCampaignAddition: () => ({
		campaignAdditionProgress: {},
		isAddingToCampaigns: false,
		addFileToCampaigns: vi.fn(),
	}),
}));

vi.mock("@/hooks/useActivityTracking", () => ({
	useActivityTracking: () => ({
		checkShouldShowRecap: vi.fn(() => false),
		markRecapShown: vi.fn(),
		checkHasBeenAway: vi.fn(() => false),
		updateActivity: vi.fn(),
	}),
}));

vi.mock("@/hooks/useFileUpload", () => ({
	useFileUpload: () => ({ handleUpload: vi.fn() }),
}));

vi.mock("@/hooks/useUploadQueueRetry", () => ({
	useUploadQueueRetry: () => {},
}));

vi.mock("@/hooks/useActionQueueRetry", () => ({
	useActionQueueRetry: () => {},
}));

vi.mock("@/hooks/useAuthReady", () => ({
	useAuthReady: () => true,
}));

vi.mock("@/hooks/useGlobalShardManager", () => ({
	useGlobalShardManager: () => ({
		shards: [],
		isLoading: false,
		fetchAllStagedShards: vi.fn(),
		removeProcessedShards: vi.fn(),
	}),
}));

vi.mock("@/hooks/useJwtExpiration", () => ({
	useJwtExpiration: () => {},
}));

describe("useAppOrchestration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns modalState and authState", () => {
		const { result } = renderHook(() => useAppOrchestration());
		expect(result.current.modalState).toBeDefined();
		expect(result.current.authState).toBeDefined();
		expect(typeof result.current.modalState.setShowAuthModal).toBe("function");
		expect(typeof result.current.authState.getStoredJwt).toBe("function");
	});

	it("returns useAppState fields", () => {
		const { result } = renderHook(() => useAppOrchestration());
		expect(result.current.chatContainerId).toBeDefined();
		expect(typeof result.current.chatContainerId).toBe("string");
		expect(result.current.textareaHeight).toBeDefined();
		expect(typeof result.current.setTextareaHeight).toBe("function");
		expect(typeof result.current.triggerFileUpload).toBe("boolean");
		expect(typeof result.current.setTriggerFileUpload).toBe("function");
	});

	it("returns campaigns and createCampaign", () => {
		const { result } = renderHook(() => useAppOrchestration());
		expect(result.current.campaigns).toEqual([]);
		expect(typeof result.current.createCampaign).toBe("function");
		expect(typeof result.current.refetchCampaigns).toBe("function");
	});
});
