/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppHeader } from "../../src/components/app/AppHeader";
import type { Campaign } from "../../src/types/campaign";
import { TooltipProvider } from "../../src/providers/TooltipProvider";

// Mock window.matchMedia for Tooltip component
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("AppHeader", () => {
  const baseProps = {
    showDebug: false,
    onToggleDebug: vi.fn(),
    onClearHistory: vi.fn(),
    onHelpAction: vi.fn(),
    onGuidanceRequest: vi.fn(),
    notifications: [],
    onDismissNotification: vi.fn(),
    onClearAllNotifications: vi.fn(),
  };

  const campaigns: Campaign[] = [
    {
      campaignId: "camp-1",
      name: "First Campaign",
      description: "first",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resources: [],
    },
    {
      campaignId: "camp-2",
      name: "Second Campaign",
      description: "second",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resources: [],
    },
  ];

  it("renders campaign dropdown with no selection by default", () => {
    render(
      <TooltipProvider>
        <AppHeader
          {...baseProps}
          campaigns={campaigns}
          selectedCampaignId={null}
          onSelectedCampaignChange={vi.fn()}
        />
      </TooltipProvider>
    );

    const select = screen.getByDisplayValue(
      "No campaign selected"
    ) as unknown as HTMLSelectElement;

    expect(select).toBeTruthy();
    expect(select?.value).toBe("");
  });

  it("calls onSelectedCampaignChange when a campaign is selected", () => {
    const handleChange = vi.fn();

    render(
      <TooltipProvider>
        <AppHeader
          {...baseProps}
          campaigns={campaigns}
          selectedCampaignId={null}
          onSelectedCampaignChange={handleChange}
        />
      </TooltipProvider>
    );

    const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "camp-1" } });

    expect(handleChange).toHaveBeenCalledWith("camp-1");
  });

  it("calls onSelectedCampaignChange with null when cleared", () => {
    const handleChange = vi.fn();

    render(
      <TooltipProvider>
        <AppHeader
          {...baseProps}
          campaigns={campaigns}
          selectedCampaignId={"camp-1"}
          onSelectedCampaignChange={handleChange}
        />
      </TooltipProvider>
    );

    const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });

    expect(handleChange).toHaveBeenCalledWith(null);
  });
});
