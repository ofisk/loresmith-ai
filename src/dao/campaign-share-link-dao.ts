import { BaseDAOClass } from "./base-dao";

export type CampaignMemberRole =
	| "editor_gm"
	| "readonly_gm"
	| "editor_player"
	| "readonly_player";

export interface CampaignShareLink {
	token: string;
	campaign_id: string;
	role: CampaignMemberRole;
	created_by: string;
	expires_at: string | null;
	max_uses: number | null;
	use_count: number;
	created_at: string;
}

export class CampaignShareLinkDAO extends BaseDAOClass {
	async createShareLink(
		token: string,
		campaignId: string,
		role: CampaignMemberRole,
		createdBy: string,
		expiresAt?: Date | null,
		maxUses?: number | null
	): Promise<void> {
		if (!(await this.hasTable("campaign_share_links"))) return;
		const sql = `
      insert into campaign_share_links (token, campaign_id, role, created_by, expires_at, max_uses, use_count, created_at)
      values (?, ?, ?, ?, ?, ?, 0, current_timestamp)
    `;
		await this.execute(sql, [
			token,
			campaignId,
			role,
			createdBy,
			expiresAt ? expiresAt.toISOString() : null,
			maxUses ?? null,
		]);
	}

	async getShareLink(token: string): Promise<CampaignShareLink | null> {
		if (!(await this.hasTable("campaign_share_links"))) return null;
		const sql = `select * from campaign_share_links where token = ?`;
		const row = await this.queryFirst<CampaignShareLink>(sql, [token]);
		return row;
	}

	async redeemShareLink(
		token: string,
		_username: string
	): Promise<{ campaignId: string; role: CampaignMemberRole } | null> {
		const link = await this.getShareLink(token);
		if (!link) return null;

		// Check expiry
		if (link.expires_at) {
			const expiresAt = new Date(link.expires_at);
			if (new Date() > expiresAt) return null;
		}

		// Check max uses
		if (link.max_uses !== null && link.use_count >= link.max_uses) {
			return null;
		}

		// Increment use_count
		await this.execute(
			`update campaign_share_links set use_count = use_count + 1 where token = ?`,
			[token]
		);

		return { campaignId: link.campaign_id, role: link.role };
	}

	async listShareLinks(campaignId: string): Promise<CampaignShareLink[]> {
		if (!(await this.hasTable("campaign_share_links"))) return [];
		const sql = `
      select * from campaign_share_links
      where campaign_id = ?
      and (expires_at is null or expires_at > datetime('now'))
      and (max_uses is null or use_count < max_uses)
      order by created_at desc
    `;
		return this.queryAll<CampaignShareLink>(sql, [campaignId]);
	}

	async revokeShareLink(token: string): Promise<void> {
		if (!(await this.hasTable("campaign_share_links"))) return;
		await this.execute(`delete from campaign_share_links where token = ?`, [
			token,
		]);
	}
}
