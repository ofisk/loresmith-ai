// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJwtExpiration } from "@/hooks/useJwtExpiration";
import { APP_EVENT_TYPE } from "@/lib/app-events";

const mockGetStoredJwt = vi.fn();
const mockIsJwtExpired = vi.fn();

vi.mock("@/services/core/auth-service", () => ({
	getStoredJwt: () => mockGetStoredJwt(),
	isJwtExpired: (jwt: string) => mockIsJwtExpired(jwt),
}));

describe("useJwtExpiration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("initializes with not expired when checkOnMount is true and JWT valid", () => {
		mockGetStoredJwt.mockReturnValue("valid-jwt");
		mockIsJwtExpired.mockReturnValue(false);

		const { result } = renderHook(() => useJwtExpiration());

		expect(result.current.isExpired).toBe(false);
		expect(result.current.expirationMessage).toBe(null);
	});

	it("sets expired on mount when JWT is expired", () => {
		mockGetStoredJwt.mockReturnValue("expired-jwt");
		mockIsJwtExpired.mockReturnValue(true);

		const onExpiration = vi.fn();
		const { result } = renderHook(() => useJwtExpiration({ onExpiration }));

		expect(result.current.isExpired).toBe(true);
		expect(result.current.expirationMessage).toBe(
			"Your session has expired. Please re-authenticate."
		);
		expect(onExpiration).toHaveBeenCalled();
	});

	it("does not check on mount when checkOnMount is false", () => {
		mockGetStoredJwt.mockReturnValue("expired-jwt");
		mockIsJwtExpired.mockReturnValue(true);

		const { result } = renderHook(() =>
			useJwtExpiration({ checkOnMount: false })
		);

		expect(result.current.isExpired).toBe(false);
		expect(mockIsJwtExpired).not.toHaveBeenCalled();
	});

	it("sets expired when JWT_EXPIRED event is dispatched", () => {
		mockGetStoredJwt.mockReturnValue(null);
		mockIsJwtExpired.mockReturnValue(false);

		const onExpiration = vi.fn();
		const { result } = renderHook(() =>
			useJwtExpiration({ checkOnMount: false, onExpiration })
		);

		act(() => {
			window.dispatchEvent(
				new CustomEvent(APP_EVENT_TYPE.JWT_EXPIRED, {
					detail: { message: "Token expired" },
				})
			);
		});

		expect(result.current.isExpired).toBe(true);
		expect(result.current.expirationMessage).toBe("Token expired");
		expect(onExpiration).toHaveBeenCalled();
	});

	it("clearExpiration resets state", () => {
		mockGetStoredJwt.mockReturnValue("expired");
		mockIsJwtExpired.mockReturnValue(true);

		const { result } = renderHook(() => useJwtExpiration());

		expect(result.current.isExpired).toBe(true);
		act(() => result.current.clearExpiration());
		expect(result.current.isExpired).toBe(false);
		expect(result.current.expirationMessage).toBe(null);
	});
});
