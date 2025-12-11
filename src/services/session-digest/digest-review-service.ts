import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";

export interface DigestReviewServiceOptions {
  db: D1Database;
}

export class DigestReviewService {
  private readonly db: D1Database;

  constructor(options: DigestReviewServiceOptions) {
    this.db = options.db;
  }

  /**
   * Submit a digest for review (draft -> pending)
   */
  async submitForReview(digestId: string, campaignId: string): Promise<void> {
    const daoFactory = getDAOFactory({ DB: this.db });

    // Verify digest exists and belongs to campaign
    const digest =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
    if (!digest) {
      throw new Error("Digest not found");
    }
    if (digest.campaignId !== campaignId) {
      throw new Error("Digest does not belong to this campaign");
    }

    // Only allow transition from draft to pending
    if (digest.status !== "draft") {
      throw new Error(
        `Cannot submit digest with status "${digest.status}" for review. Only draft digests can be submitted.`
      );
    }

    await daoFactory.sessionDigestDAO.updateDigestStatus(digestId, "pending");
  }

  /**
   * Approve a digest (pending -> approved)
   */
  async approveDigest(digestId: string, campaignId: string): Promise<void> {
    const daoFactory = getDAOFactory({ DB: this.db });

    // Verify digest exists and belongs to campaign
    const digest =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
    if (!digest) {
      throw new Error("Digest not found");
    }
    if (digest.campaignId !== campaignId) {
      throw new Error("Digest does not belong to this campaign");
    }

    // Only allow transition from pending to approved
    if (digest.status !== "pending") {
      throw new Error(
        `Cannot approve digest with status "${digest.status}". Only pending digests can be approved.`
      );
    }

    await daoFactory.sessionDigestDAO.updateDigestStatus(digestId, "approved");
  }

  /**
   * Reject a digest (pending -> rejected)
   */
  async rejectDigest(
    digestId: string,
    campaignId: string,
    reviewNotes: string
  ): Promise<void> {
    const daoFactory = getDAOFactory({ DB: this.db });

    // Verify digest exists and belongs to campaign
    const digest =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
    if (!digest) {
      throw new Error("Digest not found");
    }
    if (digest.campaignId !== campaignId) {
      throw new Error("Digest does not belong to this campaign");
    }

    // Only allow transition from pending to rejected
    if (digest.status !== "pending") {
      throw new Error(
        `Cannot reject digest with status "${digest.status}". Only pending digests can be rejected.`
      );
    }

    if (!reviewNotes || !reviewNotes.trim()) {
      throw new Error("Review notes are required when rejecting a digest");
    }

    await daoFactory.sessionDigestDAO.updateDigestStatus(
      digestId,
      "rejected",
      reviewNotes
    );
  }

  /**
   * Get pending digests for a campaign
   */
  async getPendingDigests(campaignId: string) {
    const daoFactory = getDAOFactory({ DB: this.db });
    return daoFactory.sessionDigestDAO.getPendingDigests(campaignId);
  }
}
