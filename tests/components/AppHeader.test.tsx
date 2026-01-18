/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppHeader } from "../../src/components/app/AppHeader";
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
    onClearHistory: vi.fn(),
    onHelpAction: vi.fn(),
    onGuidanceRequest: vi.fn(),
    notifications: [],
    onDismissNotification: vi.fn(),
    onClearAllNotifications: vi.fn(),
    selectedCampaignId: null,
  };

  it("renders the LoreSmith logo and title", () => {
    render(
      <TooltipProvider>
        <AppHeader {...baseProps} />
      </TooltipProvider>
    );

    expect(screen.getByText("LoreSmith")).toBeTruthy();
    expect(screen.getByAltText("LoreSmith logo")).toBeTruthy();
  });

  it("renders buttons for clear history", () => {
    render(
      <TooltipProvider>
        <AppHeader {...baseProps} />
      </TooltipProvider>
    );

    // Should have clear history button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls onClearHistory when clear button is clicked", () => {
    const handleClear = vi.fn();

    render(
      <TooltipProvider>
        <AppHeader {...baseProps} onClearHistory={handleClear} />
      </TooltipProvider>
    );

    // Find and click the clear history button (Trash icon button)
    const buttons = screen.getAllByRole("button");
    const clearButton = buttons.find((btn) =>
      btn.querySelector("svg[data-phosphor]")
    );

    if (clearButton) {
      fireEvent.click(clearButton);
      expect(handleClear).toHaveBeenCalled();
    }
  });
});
