import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileDAO } from "@/dao/file/file-dao";
import { getTimeoutSeconds } from "@/lib/file/processing-time-estimator";
import type { Env } from "@/middleware/auth";
import { cleanupStuckProcessingFiles } from "@/queue-consumer";

const mockGetStuckProcessingFiles = vi.fn();
const mockMarkFileAsTimeoutFailed = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({
		fileDAO: {
			getStuckProcessingFiles: mockGetStuckProcessingFiles,
			markFileAsTimeoutFailed: mockMarkFileAsTimeoutFailed,
		},
	})),
}));

vi.mock("@/lib/logger", () => ({
	createLogger: vi.fn(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@/lib/notifications", () => ({
	notifyFileStatusUpdated: vi.fn().mockResolvedValue(undefined),
}));

function makeFile(overrides: {
	file_key: string;
	file_name?: string;
	username?: string;
	file_size: number;
	updated_at: string;
	status?: string;
}) {
	return {
		file_key: overrides.file_key,
		file_name: overrides.file_name ?? "test.pdf",
		username: overrides.username ?? "alice",
		file_size: overrides.file_size,
		updated_at: overrides.updated_at,
		status: overrides.status ?? FileDAO.STATUS.SYNCING,
		id: overrides.file_key,
		content_type: "application/pdf",
		created_at: overrides.updated_at,
		tags: [] as string[],
	};
}

describe("cleanupStuckProcessingFiles", () => {
	const env = {} as Env;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMarkFileAsTimeoutFailed.mockResolvedValue(undefined);
	});

	it("does not time out files excluded for active sync_queue wait", async () => {
		// Contract: getStuckProcessingFiles omits rows with pending/processing
		// sync_queue entries, so cleanup must not invent timeouts for them.
		mockGetStuckProcessingFiles.mockResolvedValue([]);

		const result = await cleanupStuckProcessingFiles(env, 10);

		expect(mockGetStuckProcessingFiles).toHaveBeenCalledWith(10);
		expect(result.cleaned).toBe(0);
		expect(result.files).toEqual([]);
		expect(mockMarkFileAsTimeoutFailed).not.toHaveBeenCalled();
	});

	it("skips large files still within their size-aware timeout", async () => {
		const largeSize = 100 * 1024 * 1024; // 100MB → ~22.5 min size-aware timeout
		const sizeTimeoutSeconds = getTimeoutSeconds(largeSize);
		expect(sizeTimeoutSeconds).toBeGreaterThan(10 * 60);

		// Past the 10-minute floor, but before size-aware timeout
		const ageSeconds = Math.floor((10 * 60 + sizeTimeoutSeconds) / 2);
		mockGetStuckProcessingFiles.mockResolvedValue([
			makeFile({
				file_key: "library/alice/large.pdf",
				file_size: largeSize,
				updated_at: new Date(Date.now() - ageSeconds * 1000).toISOString(),
			}),
		]);

		const result = await cleanupStuckProcessingFiles(env, 10);

		expect(result.cleaned).toBe(0);
		expect(mockMarkFileAsTimeoutFailed).not.toHaveBeenCalled();
	});

	it("marks truly abandoned processing files as ERROR", async () => {
		const smallSize = 100 * 1024; // tiny → size-aware timeout is 3 min; floor is 10
		mockGetStuckProcessingFiles.mockResolvedValue([
			makeFile({
				file_key: "library/alice/stuck.pdf",
				file_name: "stuck.pdf",
				file_size: smallSize,
				updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
				status: FileDAO.STATUS.PROCESSING,
			}),
		]);

		const result = await cleanupStuckProcessingFiles(env, 10);

		expect(result.cleaned).toBe(1);
		expect(result.files).toEqual([
			{
				fileKey: "library/alice/stuck.pdf",
				fileName: "stuck.pdf",
				username: "alice",
			},
		]);
		expect(mockMarkFileAsTimeoutFailed).toHaveBeenCalledWith(
			"library/alice/stuck.pdf",
			expect.stringContaining("Processing timeout")
		);
	});

	it("marks large abandoned files once past size-aware timeout", async () => {
		const largeSize = 100 * 1024 * 1024;
		const sizeTimeoutSeconds = getTimeoutSeconds(largeSize);
		mockGetStuckProcessingFiles.mockResolvedValue([
			makeFile({
				file_key: "library/alice/huge.pdf",
				file_name: "huge.pdf",
				file_size: largeSize,
				updated_at: new Date(
					Date.now() - (sizeTimeoutSeconds + 60) * 1000
				).toISOString(),
			}),
		]);

		const result = await cleanupStuckProcessingFiles(env, 10);

		expect(result.cleaned).toBe(1);
		expect(mockMarkFileAsTimeoutFailed).toHaveBeenCalledWith(
			"library/alice/huge.pdf",
			expect.stringMatching(/more than \d+ minutes/)
		);
	});
});
