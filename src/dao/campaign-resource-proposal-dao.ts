import { BaseDAOClass } from "./base-dao";

export type ResourceProposalStatus = "pending" | "approved" | "rejected";

export interface CampaignResourceProposal {
	id: string;
	campaign_id: string;
	file_key: string;
	file_name: string;
	proposed_by: string;
	status: ResourceProposalStatus;
	reviewed_by: string | null;
	reviewed_at: string | null;
	created_at: string;
}

export class CampaignResourceProposalDAO extends BaseDAOClass {
	async createProposal(
		id: string,
		campaignId: string,
		fileKey: string,
		fileName: string,
		proposedBy: string
	): Promise<void> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return;
		const sql = `
      insert into campaign_resource_proposals (id, campaign_id, file_key, file_name, proposed_by, status, created_at)
      values (?, ?, ?, ?, ?, 'pending', current_timestamp)
    `;
		await this.execute(sql, [id, campaignId, fileKey, fileName, proposedBy]);
	}

	async getProposalById(
		id: string,
		campaignId: string
	): Promise<CampaignResourceProposal | null> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return null;
		const sql = `
      select * from campaign_resource_proposals
      where id = ? and campaign_id = ?
    `;
		return this.queryFirst<CampaignResourceProposal>(sql, [id, campaignId]);
	}

	async listPendingProposals(
		campaignId: string
	): Promise<CampaignResourceProposal[]> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return [];
		const sql = `
      select * from campaign_resource_proposals
      where campaign_id = ? and status = 'pending'
      order by created_at desc
    `;
		return this.queryAll<CampaignResourceProposal>(sql, [campaignId]);
	}

	async approveProposal(
		id: string,
		campaignId: string,
		reviewedBy: string
	): Promise<void> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return;
		const sql = `
      update campaign_resource_proposals
      set status = 'approved', reviewed_by = ?, reviewed_at = current_timestamp
      where id = ? and campaign_id = ? and status = 'pending'
    `;
		await this.execute(sql, [reviewedBy, id, campaignId]);
	}

	async rejectProposal(
		id: string,
		campaignId: string,
		reviewedBy: string
	): Promise<void> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return;
		const sql = `
      update campaign_resource_proposals
      set status = 'rejected', reviewed_by = ?, reviewed_at = current_timestamp
      where id = ? and campaign_id = ? and status = 'pending'
    `;
		await this.execute(sql, [reviewedBy, id, campaignId]);
	}

	async hasExistingProposal(
		campaignId: string,
		fileKey: string,
		proposedBy: string
	): Promise<boolean> {
		if (!(await this.hasTable("campaign_resource_proposals"))) return false;
		const sql = `
      select 1 from campaign_resource_proposals
      where campaign_id = ? and file_key = ? and proposed_by = ? and status = 'pending'
    `;
		const result = await this.queryFirst<{ 1: number }>(sql, [
			campaignId,
			fileKey,
			proposedBy,
		]);
		return result !== null;
	}
}
