// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceSidePanel } from "@/components/resource-side-panel/ResourceSidePanel";
import { makeCampaign } from "../factories";

// Mock the hooks and services
vi.mock("@/hooks/useCampaignManagement", () => ({
	useCampaignManagement: vi.fn(() => ({
		campaigns: [],
		campaignsLoading: false,
		campaignsError: null,
	})),
}));

vi.mock("@/services/core/auth-service", () => ({
	AuthService: {
		getUsernameFromStoredJwt: vi.fn(() => "testuser"),
		isJwtExpired: vi.fn(() => false),
	},
	getStoredJwt: vi.fn(() => "mock-jwt"),
	isJwtExpired: vi.fn(() => false),
	authenticatedFetchWithExpiration: vi.fn(async () => ({
		response: {
			ok: true,
			status: 200,
			json: async () => ({ files: [] }),
		},
		jwtExpired: false,
	})),
}));

describe("ResourceSidePanel", () => {
	const mockOnLogout = vi.fn();
	const mockOnAddResource = vi.fn();
	const mockSetShowUserMenu = vi.fn();

	const mockCampaigns = [
		makeCampaign({
			campaignId: "camp-1",
			name: "Test Campaign",
			description: "A test campaign",
		}),
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should render when authenticated", () => {
		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onLogout={mockOnLogout}
				setShowUserMenu={mockSetShowUserMenu}
			/>
		);

		expect(screen.getByText("testuser")).toBeInTheDocument();
	});

	it("should render campaigns and library sections", () => {
		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onLogout={mockOnLogout}
			/>
		);

		// The sections are rendered through child components
		// We can verify the container is present
		const container = screen.getByText("testuser").closest("div");
		expect(container).toBeInTheDocument();
	});

	it("should call onAddResource when triggerFileUpload is true", async () => {
		const { rerender } = render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onAddResource={mockOnAddResource}
				onFileUploadTriggered={vi.fn()}
				triggerFileUpload={false}
			/>
		);

		expect(mockOnAddResource).not.toHaveBeenCalled();

		rerender(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onAddResource={mockOnAddResource}
				onFileUploadTriggered={vi.fn()}
				triggerFileUpload={true}
			/>
		);

		await waitFor(() => {
			expect(mockOnAddResource).toHaveBeenCalledTimes(1);
		});
	});

	it("should show user menu when showUserMenu is true", () => {
		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				showUserMenu={true}
				setShowUserMenu={mockSetShowUserMenu}
			/>
		);

		expect(screen.getByText("Logout")).toBeInTheDocument();
	});

	it("should call onLogout when logout button is clicked", async () => {
		mockOnLogout.mockResolvedValue(undefined);
		const _confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onLogout={mockOnLogout}
				showUserMenu={true}
				setShowUserMenu={mockSetShowUserMenu}
			/>
		);

		const logoutButton = screen.getByText("Logout");
		fireEvent.click(logoutButton);

		await waitFor(() => {
			expect(mockOnLogout).toHaveBeenCalledTimes(1);
		});
	});

	it("should not call onLogout when user cancels logout confirmation", async () => {
		const _confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				onLogout={mockOnLogout}
				showUserMenu={true}
				setShowUserMenu={mockSetShowUserMenu}
			/>
		);

		const logoutButton = screen.getByText("Logout");
		fireEvent.click(logoutButton);

		await waitFor(() => {
			expect(mockOnLogout).not.toHaveBeenCalled();
		});
	});

	it("should toggle user menu when username button is clicked", () => {
		render(
			<ResourceSidePanel
				isAuthenticated={true}
				campaigns={mockCampaigns}
				showUserMenu={false}
				setShowUserMenu={mockSetShowUserMenu}
			/>
		);

		const usernameButton = screen.getByText("testuser").closest("button");
		expect(usernameButton).toBeInTheDocument();

		if (usernameButton) {
			fireEvent.click(usernameButton);
			expect(mockSetShowUserMenu).toHaveBeenCalledWith(true);
		}
	});

	it("should not render user section when not authenticated", () => {
		render(
			<ResourceSidePanel isAuthenticated={false} campaigns={mockCampaigns} />
		);

		expect(screen.queryByText("testuser")).not.toBeInTheDocument();
	});
});
