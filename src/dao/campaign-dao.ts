import { BaseDAOClass } from "./base-dao";

export interface Campaign {
  id: string;
  name: string;
  username: string;
  description?: string;
  campaignRagBasePath?: string;
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
  file_key: string;
  file_name: string;
  description?: string;
  tags?: string;
  status: string;
  created_at: string;
  updated_at?: string;
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
    description?: string,
    campaignRagBasePath?: string
  ): Promise<void> {
    const sql = `
      insert into campaigns (id, name, username, description, campaignRagBasePath, created_at, updated_at)
      values (?, ?, ?, ?, ?, current_timestamp, current_timestamp)
    `;
    await this.execute(sql, [
      id,
      name,
      username,
      description,
      campaignRagBasePath,
    ]);
  }

  async getCampaignsByUser(username: string): Promise<Campaign[]> {
    const sql = `
      select * from campaigns 
      where username = ? 
      order by updated_at desc
    `;
    return await this.queryAll<Campaign>(sql, [username]);
  }

  async getCampaignsByUserWithMapping(username: string): Promise<
    {
      campaignId: string;
      name: string;
      description: string;
      username: string;
      campaignRagBasePath: string;
      createdAt: string;
      updatedAt: string;
    }[]
  > {
    const sql = `
      select 
        id as campaignId, 
        name, 
        description, 
        username, 
        campaignRagBasePath,
        created_at as createdAt, 
        updated_at as updatedAt 
      from campaigns 
      where username = ? 
      order by created_at desc
    `;
    return await this.queryAll(sql, [username]);
  }

  async getCampaignById(campaignId: string): Promise<Campaign | null> {
    const sql = "select * from campaigns where id = ?";
    return await this.queryFirst<Campaign>(sql, [campaignId]);
  }

  async getCampaignByIdWithMapping(
    campaignId: string,
    username: string
  ): Promise<{
    campaignId: string;
    name: string;
    description: string;
    campaignRagBasePath: string;
    createdAt: string;
    updatedAt: string;
  } | null> {
    const sql = `
      select 
        id as campaignId, 
        name, 
        description, 
        campaignRagBasePath, 
        created_at as createdAt, 
        updated_at as updatedAt 
      from campaigns 
      where id = ? and username = ?
    `;
    return await this.queryFirst(sql, [campaignId, username]);
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
      update campaigns 
      set ${setClause}, updated_at = current_timestamp
      where id = ?
    `;

    const values = [...Object.values(updates), campaignId];
    await this.execute(sql, values);
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await this.transaction([
      () =>
        this.execute("delete from campaign_context where campaign_id = ?", [
          campaignId,
        ]),
      () =>
        this.execute("delete from campaign_characters where campaign_id = ?", [
          campaignId,
        ]),
      () =>
        this.execute("delete from campaign_resources where campaign_id = ?", [
          campaignId,
        ]),
      () => this.execute("delete from campaigns where id = ?", [campaignId]),
    ]);
  }

  async getCampaignContext(campaignId: string): Promise<CampaignContext[]> {
    const sql = `
      select * from campaign_context 
      where campaign_id = ? 
      order by created_at desc
    `;
    return await this.queryAll<CampaignContext>(sql, [campaignId]);
  }

  async addCampaignContext(
    campaignId: string,
    contextType: string,
    content: string
  ): Promise<void> {
    const sql = `
      insert into campaign_context (campaign_id, context_type, content, created_at, updated_at)
      values (?, ?, ?, current_timestamp, current_timestamp)
    `;
    await this.execute(sql, [campaignId, contextType, content]);
  }

  async getCampaignCharacters(
    campaignId: string
  ): Promise<CampaignCharacter[]> {
    const sql = `
      select * from campaign_characters 
      where campaign_id = ? 
      order by created_at desc
    `;
    return await this.queryAll<CampaignCharacter>(sql, [campaignId]);
  }

  async addCampaignCharacter(
    campaignId: string,
    characterName: string,
    characterData: string
  ): Promise<void> {
    const sql = `
      insert into campaign_characters (campaign_id, character_name, character_data, created_at, updated_at)
      values (?, ?, ?, current_timestamp, current_timestamp)
    `;
    await this.execute(sql, [campaignId, characterName, characterData]);
  }

  async getCampaignResources(campaignId: string): Promise<CampaignResource[]> {
    const sql = `
      select * from campaign_resources 
      where campaign_id = ? 
      order by created_at desc
    `;
    return await this.queryAll<CampaignResource>(sql, [campaignId]);
  }

  async addCampaignResource(
    campaignId: string,
    fileKey: string,
    fileName: string,
    description?: string,
    tags?: string,
    status?: string
  ): Promise<string> {
    const resourceId = crypto.randomUUID();
    const sql = `
      insert into campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, current_timestamp, current_timestamp)
    `;
    await this.execute(sql, [
      resourceId,
      campaignId,
      fileKey,
      fileName,
      description || "",
      tags || "[]",
      status || "active",
    ]);
    return resourceId;
  }

  async removeCampaignResource(
    campaignId: string,
    resourceId: string
  ): Promise<void> {
    const sql =
      "delete from campaign_resources where campaign_id = ? and resource_id = ?";
    await this.execute(sql, [campaignId, resourceId]);
  }

  async removeAllCampaigns(
    username: string
  ): Promise<{ id: string; name: string }[]> {
    // First get all campaigns to return
    const campaigns = await this.queryAll<{ id: string; name: string }>(
      "select id, name from campaigns where username = ?",
      [username]
    );

    if (campaigns.length === 0) {
      return [];
    }

    // Delete in transaction
    await this.transaction([
      () =>
        this.execute(
          "delete from campaign_resources where campaign_id in (select id from campaigns where username = ?)",
          [username]
        ),
      () =>
        this.execute("delete from campaigns where username = ?", [username]),
    ]);

    return campaigns;
  }

  async getCampaignCount(username: string): Promise<number> {
    const sql = "select count(*) as count from campaigns where username = ?";
    const result = await this.queryFirst<{ count: number }>(sql, [username]);
    return result?.count || 0;
  }

  async userOwnsCampaign(
    username: string,
    campaignId: string
  ): Promise<boolean> {
    const sql = "select 1 from campaigns where id = ? and username = ?";
    const result = await this.queryFirst<{ 1: number }>(sql, [
      campaignId,
      username,
    ]);
    return result !== null;
  }

  async getCampaignRagBasePath(
    username: string,
    campaignId: string
  ): Promise<string | null> {
    const sql =
      "select campaignRagBasePath from campaigns where id = ? and username = ?";
    const result = await this.queryFirst<{ campaignRagBasePath: string }>(sql, [
      campaignId,
      username,
    ]);
    return result?.campaignRagBasePath || null;
  }

  // Resolve campaign by exact (case-insensitive) name
  async getCampaignIdByExactName(name: string): Promise<string | null> {
    const sql = "select id from campaigns where lower(name) = lower(?) limit 1";
    const result = await this.queryFirst<{ id: string }>(sql, [name]);
    return result?.id ?? null;
  }

  // Resolve campaign by LIKE match, newest first
  async searchCampaignIdByLike(name: string): Promise<string | null> {
    const sql =
      "select id from campaigns where name like ? order by created_at desc limit 1";
    const result = await this.queryFirst<{ id: string }>(sql, [`%${name}%`]);
    return result?.id ?? null;
  }

  // Get all campaign names for AI-assisted resolution
  async getAllCampaignNames(): Promise<{ id: string; name: string }[]> {
    const sql = "select id, name from campaigns order by name";
    return await this.queryAll<{ id: string; name: string }>(sql);
  }

  // Check if campaign exists and belongs to user (for route validation)
  async getCampaignOwnership(
    campaignId: string,
    username: string
  ): Promise<{ id: string; name: string; username: string } | null> {
    const sql =
      "select id, name, username from campaigns where id = ? and username = ?";
    return await this.queryFirst<{
      id: string;
      name: string;
      username: string;
    }>(sql, [campaignId, username]);
  }

  // Get campaign resource by ID and campaign ID
  async getCampaignResourceById(
    resourceId: string,
    campaignId: string
  ): Promise<{ id: string; file_key: string; file_name: string } | null> {
    const sql =
      "select id, file_key, file_name from campaign_resources where id = ? and campaign_id = ?";
    return await this.queryFirst<{
      id: string;
      file_key: string;
      file_name: string;
    }>(sql, [resourceId, campaignId]);
  }

  // Check if resource already exists in campaign
  async getCampaignResourceByFileKey(
    campaignId: string,
    fileKey: string
  ): Promise<{ id: string; file_name: string } | null> {
    const sql =
      "select id, file_name from campaign_resources where campaign_id = ? and file_key = ?";
    return await this.queryFirst<{ id: string; file_name: string }>(sql, [
      campaignId,
      fileKey,
    ]);
  }
}
