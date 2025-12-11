import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangelogArchiveDAO } from "@/dao/changelog-archive-dao";

const mockDB = {
  prepare: vi.fn(),
} as unknown as D1Database;

describe("ChangelogArchiveDAO", () => {
  let dao: ChangelogArchiveDAO;
  let mockStatement: {
    bind: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(),
      all: vi.fn(),
      first: vi.fn(),
    };
    (mockDB.prepare as any).mockReturnValue(mockStatement);
    dao = new ChangelogArchiveDAO(mockDB);
  });

  it("creates archive metadata", async () => {
    mockStatement.run.mockResolvedValue({});
    await dao.createArchiveMetadata({
      id: "meta-1",
      campaignId: "campaign-123",
      rebuildId: "rebuild-456",
      archiveKey: "archive-key-1",
      sessionRange: { min: 1, max: 5 },
      timestampRange: {
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-05T00:00:00Z",
      },
      entryCount: 10,
    });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO changelog_archive_metadata")
    );
  });

  it("queries archive metadata by campaign", async () => {
    mockStatement.all.mockResolvedValue({
      results: [],
    });

    await dao.getArchiveMetadata("campaign-123");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("SELECT")
    );
  });

  it("deletes archive metadata by key", async () => {
    mockStatement.run.mockResolvedValue({});
    await dao.deleteArchiveMetadata("archive-key-1");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM changelog_archive_metadata")
    );
  });
});
