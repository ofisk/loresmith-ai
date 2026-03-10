// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { useLocalNotifications } from "@/hooks/useLocalNotifications";

vi.mock("@/hooks/useNotificationStream", () => ({
	useNotificationStream: () => ({
		notifications: [],
		isConnected: false,
		error: null,
		clearNotifications: vi.fn(),
	}),
}));

describe("useLocalNotifications", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<NotificationProvider>{children}</NotificationProvider>
	);

	it("initializes with empty notifications", () => {
		const { result } = renderHook(() => useLocalNotifications(), {
			wrapper,
		});

		expect(result.current.localNotifications).toEqual([]);
		expect(result.current.activeNotifications).toEqual([]);
		expect(result.current.allNotifications).toEqual([]);
	});

	it("addLocalNotification adds a notification", () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { result } = renderHook(() => useLocalNotifications(), {
			wrapper,
		});

		act(() => {
			result.current.addLocalNotification("info", "Title", "Message");
		});

		expect(result.current.localNotifications).toHaveLength(1);
		expect(result.current.localNotifications[0]).toMatchObject({
			type: "info",
			title: "Title",
			message: "Message",
		});
		expect(result.current.localNotifications[0].timestamp).toBeDefined();
		expect(result.current.allNotifications).toHaveLength(1);

		consoleSpy.mockRestore();
	});

	it("dismissNotification removes local notification by timestamp", () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { result } = renderHook(() => useLocalNotifications(), {
			wrapper,
		});

		act(() => {
			result.current.addLocalNotification("info", "T", "M");
		});
		const ts = result.current.localNotifications[0].timestamp;

		act(() => {
			result.current.dismissNotification(ts);
		});

		expect(result.current.localNotifications).toHaveLength(0);

		consoleSpy.mockRestore();
	});

	it("clearAllNotifications clears local notifications", () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { result } = renderHook(() => useLocalNotifications(), {
			wrapper,
		});

		act(() => {
			result.current.addLocalNotification("info", "T", "M");
		});

		act(() => {
			result.current.clearAllNotifications();
		});

		expect(result.current.localNotifications).toEqual([]);

		consoleSpy.mockRestore();
	});
});
