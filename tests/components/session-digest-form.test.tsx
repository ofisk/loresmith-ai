import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionDigestForm } from "@/components/session/SessionDigestForm";

// Mock hooks used by the form to avoid real network calls
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

vi.mock("@/hooks/usePlanningTasks", () => ({
  usePlanningTasks: vi.fn(() => ({
    tasks: [],
    error: null,
    fetchPlanningTasks: {
      execute: vi.fn(),
      loading: false,
    },
    createPlanningTask: {
      execute: vi.fn(),
      loading: false,
    },
    updatePlanningTask: {
      execute: vi.fn(),
      loading: false,
    },
    deletePlanningTask: {
      execute: vi.fn(),
      loading: false,
    },
    bulkCompletePlanningTasks: {
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
