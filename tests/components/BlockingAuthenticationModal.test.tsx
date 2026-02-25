import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockingAuthenticationModal } from "@/components/BlockingAuthenticationModal";

describe("BlockingAuthenticationModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders choice view when open", () => {
		render(<BlockingAuthenticationModal isOpen={true} />);

		expect(screen.getByText("Welcome to LoreSmith")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /sign in with google/i })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /create account/i })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /^sign in$/i })
		).toBeInTheDocument();
	});

	it("does not render when closed", () => {
		render(<BlockingAuthenticationModal isOpen={false} />);
		expect(screen.queryByText("Welcome to LoreSmith")).not.toBeInTheDocument();
	});

	it("enables create account submit when fields are valid", () => {
		render(<BlockingAuthenticationModal isOpen={true} />);

		fireEvent.click(screen.getByRole("button", { name: /create account/i }));

		const submit = screen.getByRole("button", { name: /create account/i });
		expect(submit).toBeDisabled();

		fireEvent.change(screen.getByLabelText(/^username$/i), {
			target: { value: "testuser" },
		});
		fireEvent.change(screen.getByLabelText(/^email$/i), {
			target: { value: "test@example.com" },
		});
		fireEvent.change(screen.getByLabelText(/^password$/i), {
			target: { value: "password123" },
		});
		fireEvent.change(screen.getByLabelText(/^confirm password$/i), {
			target: { value: "password123" },
		});

		expect(submit).not.toBeDisabled();
	});

	it("enables sign in submit when fields are filled", () => {
		render(<BlockingAuthenticationModal isOpen={true} />);

		fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

		const submit = screen.getByRole("button", { name: /^sign in$/i });
		expect(submit).toBeDisabled();

		fireEvent.change(screen.getByLabelText(/^username$/i), {
			target: { value: "testuser" },
		});
		fireEvent.change(screen.getByLabelText(/^password$/i), {
			target: { value: "password123" },
		});

		expect(submit).not.toBeDisabled();
	});
});
