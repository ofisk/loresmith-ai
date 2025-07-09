import { DurableObject } from "cloudflare:workers";

export interface Campaign {
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Resource {
  id: string;
  campaignId: string;
  type: string;
  name?: string;
}

export class CampaignManager extends DurableObject {
  // TODO: Use DurableObjectState for ctx
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.ensureTables();
  }

  async ensureTables() {
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        campaignId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        campaignId TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        FOREIGN KEY (campaignId) REFERENCES campaigns(campaignId)
      );
    `);
  }

  // List all campaigns for this user
  async listCampaigns(): Promise<Campaign[]> {
    try {
      const cursor = await this.ctx.storage.sql.exec(
        "SELECT * FROM campaigns ORDER BY createdAt DESC"
      );
      if (
        cursor &&
        Array.isArray((cursor as unknown as { results?: unknown[] }).results)
      ) {
        const results = (cursor as unknown as { results: Campaign[] }).results;
        console.log("[DO] listCampaigns found:", results.length, "campaigns");
        return results;
      }
      console.log("[DO] listCampaigns found no campaigns");
      return [];
    } catch (error) {
      console.error("[DO] Error in listCampaigns:", error);
      return [];
    }
  }

  // Create a new campaign
  async createCampaign(name: string): Promise<Campaign> {
    try {
      const campaignId = crypto.randomUUID();
      const now = new Date().toISOString();
      await this.ctx.storage.sql.exec(
        "INSERT INTO campaigns (campaignId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
        [campaignId, name, now, now]
      );
      console.log("[DO] Created campaign:", { campaignId, name });
      return { campaignId, name, createdAt: now, updatedAt: now };
    } catch (error) {
      console.error("[DO] Error in createCampaign:", error);
      throw error;
    }
  }

  // HTTP fetch handler for debugging (optional)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log("[DO] fetch called:", url.pathname, request.method);
    try {
      if (url.pathname === "/list") {
        const campaigns = await this.listCampaigns();
        return Response.json({ campaigns });
      }
      if (url.pathname === "/create" && request.method === "POST") {
        const body: { name: string } = await request.json();
        const campaign = await this.createCampaign(body.name);
        return Response.json({ campaign });
      }
      // Main handler for /campaigns
      if (url.pathname === "/campaigns") {
        if (request.method === "GET") {
          const campaigns = await this.listCampaigns();
          return Response.json({ campaigns });
        }
        if (request.method === "POST") {
          const body: { name: string } = await request.json();
          const campaign = await this.createCampaign(body.name);
          return Response.json({ campaign });
        }
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("[DO] Error in fetch handler:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
}
