import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BlockingAuthenticationModal } from "@/components/BlockingAuthenticationModal";

describe("BlockingAuthenticationModal", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render when isOpen is true", () => {
    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    expect(screen.getByText("Authentication Required")).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/admin key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/openai api key/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("should not render when isOpen is false", () => {
    render(
      <BlockingAuthenticationModal isOpen={false} onSubmit={mockOnSubmit} />
    );

    expect(
      screen.queryByText("Authentication Required")
    ).not.toBeInTheDocument();
  });

  it("should prefill OpenAI key when storedOpenAIKey is provided", async () => {
    const storedKey = "sk-test1234567890";
    render(
      <BlockingAuthenticationModal
        isOpen={true}
        storedOpenAIKey={storedKey}
        onSubmit={mockOnSubmit}
      />
    );

    const openaiInput = screen.getByLabelText(/openai api key/i);
    await waitFor(() => {
      expect(openaiInput).toHaveValue(
        `${storedKey.substring(0, 8)}...${storedKey.substring(storedKey.length - 4)}`
      );
      expect(openaiInput).toBeDisabled();
    });
  });

  it("should disable submit button when username is empty", () => {
    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it("should disable submit button when OpenAI key is empty (and no stored key)", () => {
    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const usernameInput = screen.getByLabelText(/username/i);
    fireEvent.change(usernameInput, { target: { value: "testuser" } });

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it("should enable submit button when all required fields are filled", async () => {
    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const openaiInput = screen.getByLabelText(/openai api key/i);

    fireEvent.change(usernameInput, { target: { value: "testuser" } });
    fireEvent.change(openaiInput, { target: { value: "sk-test1234567890" } });

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it("should call onSubmit with correct values when form is submitted", async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const adminKeyInput = screen.getByLabelText(/admin key/i);
    const openaiInput = screen.getByLabelText(/openai api key/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: "testuser" } });
    fireEvent.change(adminKeyInput, { target: { value: "admin123" } });
    fireEvent.change(openaiInput, { target: { value: "sk-test1234567890" } });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        "testuser",
        "admin123",
        "sk-test1234567890"
      );
    });
  });

  it("should display error message when onSubmit fails", async () => {
    const errorMessage = "Authentication failed";
    mockOnSubmit.mockRejectedValue(new Error(errorMessage));

    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const openaiInput = screen.getByLabelText(/openai api key/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: "testuser" } });
    fireEvent.change(openaiInput, { target: { value: "sk-test1234567890" } });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it("should show loading state during submission", async () => {
    mockOnSubmit.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(
      <BlockingAuthenticationModal isOpen={true} onSubmit={mockOnSubmit} />
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const openaiInput = screen.getByLabelText(/openai api key/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: "testuser" } });
    fireEvent.change(openaiInput, { target: { value: "sk-test1234567890" } });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    fireEvent.click(submitButton);

    expect(screen.getByText("Authenticating...")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await waitFor(
      () => {
        expect(screen.queryByText("Authenticating...")).not.toBeInTheDocument();
      },
      { timeout: 200 }
    );
  });
});
