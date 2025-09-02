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
    resourceType: string,
    resourceId: string,
    resourceName?: string
  ): Promise<void> {
    const sql = `
      insert into campaign_resources (campaign_id, resource_type, resource_id, resource_name, created_at, updated_at)
      values (?, ?, ?, ?, current_timestamp, current_timestamp)
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
      "delete from campaign_resources where campaign_id = ? and resource_id = ?";
    await this.execute(sql, [campaignId, resourceId]);
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
}
