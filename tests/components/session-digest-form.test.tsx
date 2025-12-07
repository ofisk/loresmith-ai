import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionDigestForm } from "@/components/session/SessionDigestForm";

// Mock the hook
vi.mock("@/hooks/useSessionDigests", () => ({
  useSessionDigests: vi.fn(() => ({
    createSessionDigest: {
      execute: vi.fn(),
      loading: false,
    },
    updateSessionDigest: {
      execute: vi.fn(),
      loading: false,
    },
  })),
}));

describe("SessionDigestForm", () => {
  it("should render form fields", () => {
    render(
      <SessionDigestForm
        campaignId="campaign-1"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Session Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Session Date/i)).toBeInTheDocument();
  });

  it("should render all sections", () => {
    render(
      <SessionDigestForm
        campaignId="campaign-1"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Last Session Recap")).toBeInTheDocument();
    expect(screen.getByText("Next Session Plan")).toBeInTheDocument();
    expect(screen.getByText("Additional Planning")).toBeInTheDocument();
  });
});
