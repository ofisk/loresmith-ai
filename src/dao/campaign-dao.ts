import { BaseDAOClass } from "./base-dao";

export interface Campaign {
  id: string;
  name: string;
  username: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignContext {
  id: string;
  campaign_id: string;
  context_type: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignCharacter {
  id: string;
  campaign_id: string;
  character_name: string;
  character_data: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignResource {
  id: string;
  campaign_id: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignWithDetails extends Campaign {
  context: CampaignContext[];
  characters: CampaignCharacter[];
  resources: CampaignResource[];
}

export class CampaignDAO extends BaseDAOClass {
  async createCampaign(
    id: string,
    name: string,
    username: string,
    description?: string
  ): Promise<void> {
    const sql = `
      INSERT INTO campaigns (id, name, username, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [id, name, username, description]);
  }

  async getCampaignsByUser(username: string): Promise<Campaign[]> {
    const sql = `
      SELECT * FROM campaigns 
      WHERE username = ? 
      ORDER BY updated_at DESC
    `;
    return await this.queryAll<Campaign>(sql, [username]);
  }

  async getCampaignById(campaignId: string): Promise<Campaign | null> {
    const sql = "SELECT * FROM campaigns WHERE id = ?";
    return await this.queryFirst<Campaign>(sql, [campaignId]);
  }

  async getCampaignWithDetails(
    campaignId: string
  ): Promise<CampaignWithDetails | null> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return null;

    const [context, characters, resources] = await Promise.all([
      this.getCampaignContext(campaignId),
      this.getCampaignCharacters(campaignId),
      this.getCampaignResources(campaignId),
    ]);

    return {
      ...campaign,
      context,
      characters,
      resources,
    };
  }

  async updateCampaign(
    campaignId: string,
    updates: Partial<Pick<Campaign, "name" | "description">>
  ): Promise<void> {
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const sql = `
      UPDATE campaigns 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const values = [...Object.values(updates), campaignId];
    await this.execute(sql, values);
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await this.transaction([
      () =>
        this.execute("DELETE FROM campaign_context WHERE campaign_id = ?", [
          campaignId,
        ]),
      () =>
        this.execute("DELETE FROM campaign_characters WHERE campaign_id = ?", [
          campaignId,
        ]),
      () =>
        this.execute("DELETE FROM campaign_resources WHERE campaign_id = ?", [
          campaignId,
        ]),
      () => this.execute("DELETE FROM campaigns WHERE id = ?", [campaignId]),
    ]);
  }

  async getCampaignContext(campaignId: string): Promise<CampaignContext[]> {
    const sql = `
      SELECT * FROM campaign_context 
      WHERE campaign_id = ? 
      ORDER BY created_at DESC
    `;
    return await this.queryAll<CampaignContext>(sql, [campaignId]);
  }

  async addCampaignContext(
    campaignId: string,
    contextType: string,
    content: string
  ): Promise<void> {
    const sql = `
      INSERT INTO campaign_context (campaign_id, context_type, content, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [campaignId, contextType, content]);
  }

  async getCampaignCharacters(
    campaignId: string
  ): Promise<CampaignCharacter[]> {
    const sql = `
      SELECT * FROM campaign_characters 
      WHERE campaign_id = ? 
      ORDER BY created_at DESC
    `;
    return await this.queryAll<CampaignCharacter>(sql, [campaignId]);
  }

  async addCampaignCharacter(
    campaignId: string,
    characterName: string,
    characterData: string
  ): Promise<void> {
    const sql = `
      INSERT INTO campaign_characters (campaign_id, character_name, character_data, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [campaignId, characterName, characterData]);
  }

  async getCampaignResources(campaignId: string): Promise<CampaignResource[]> {
    const sql = `
      SELECT * FROM campaign_resources 
      WHERE campaign_id = ? 
      ORDER BY created_at DESC
    `;
    return await this.queryAll<CampaignResource>(sql, [campaignId]);
  }

  async addCampaignResource(
    campaignId: string,
    resourceType: string,
    resourceId: string,
    resourceName?: string
  ): Promise<void> {
    const sql = `
      INSERT INTO campaign_resources (campaign_id, resource_type, resource_id, resource_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [
      campaignId,
      resourceType,
      resourceId,
      resourceName,
    ]);
  }

  async removeCampaignResource(
    campaignId: string,
    resourceId: string
  ): Promise<void> {
    const sql =
      "DELETE FROM campaign_resources WHERE campaign_id = ? AND resource_id = ?";
    await this.execute(sql, [campaignId, resourceId]);
  }

  async getCampaignCount(username: string): Promise<number> {
    const sql = "SELECT COUNT(*) as count FROM campaigns WHERE username = ?";
    const result = await this.queryFirst<{ count: number }>(sql, [username]);
    return result?.count || 0;
  }

  async userOwnsCampaign(
    username: string,
    campaignId: string
  ): Promise<boolean> {
    const sql = "SELECT 1 FROM campaigns WHERE id = ? AND username = ?";
    const result = await this.queryFirst<{ 1: number }>(sql, [
      campaignId,
      username,
    ]);
    return result !== null;
  }
}
