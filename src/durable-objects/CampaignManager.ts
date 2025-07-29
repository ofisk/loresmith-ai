import { DurableObject } from "cloudflare:workers";

export interface Resource {
  id: string;
  campaignId: string;
  type: string;
  name?: string;
}

import type { CampaignData } from "../types/campaign";

export class CampaignManager extends DurableObject {
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
  async listCampaigns(): Promise<CampaignData[]> {
    try {
      // Ensure tables exist before querying
      await this.ensureTables();

      console.log("[DO] About to query campaigns");
      const cursor = await this.ctx.storage.sql.exec(
        "SELECT campaignId, name, createdAt, updatedAt FROM campaigns ORDER BY createdAt DESC"
      );
      if (
        cursor &&
        Array.isArray((cursor as unknown as { results?: unknown[] }).results)
      ) {
        const results = (cursor as unknown as { results: CampaignData[] })
          .results;
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
  async createCampaign(
    name: string,
    username: string = "default"
  ): Promise<CampaignData> {
    try {
      console.log(
        "[DO] createCampaign called with name:",
        name,
        "username:",
        username
      );

      const campaignId = crypto.randomUUID();
      const now = new Date().toISOString();
      console.log("[DO] Generated campaign data:", {
        campaignId,
        name,
        username,
        now,
      });

      // Save to database
      await this.ensureTables();
      await this.ctx.storage.sql.exec(
        "INSERT INTO campaigns (campaignId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
        [campaignId, name, now, now]
      );

      console.log("[DO] Created campaign (with SQL):", {
        campaignId,
        name,
        username,
      });
      return {
        campaignId,
        name,
        createdAt: now,
        updatedAt: now,
        resources: [],
      };
    } catch (error) {
      console.error("[DO] Error in createCampaign:", error);
      throw error;
    }
  }

  // HTTP fetch handler for debugging (optional)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log(
      "[DO] fetch called:",
      url.pathname,
      request.method,
      "Full URL:",
      request.url
    );
    try {
      if (url.pathname === "/list") {
        const campaigns = await this.listCampaigns();
        return Response.json({ campaigns });
      }
      if (url.pathname === "/test") {
        console.log("[DO] Test endpoint called");
        return Response.json({ message: "CampaignManager is working" });
      }
      if (url.pathname === "/create" && request.method === "POST") {
        const body: { name: string } = await request.json();
        const campaign = await this.createCampaign(body.name);
        return Response.json({ campaign });
      }
      // Main handler for /campaigns
      if (url.pathname === "/campaigns") {
        if (request.method === "GET") {
          console.log("[DO] GET /campaigns - returning empty array for now");
          return Response.json({ campaigns: [] });
        }
        if (request.method === "POST") {
          console.log("[DO] Processing POST request to /campaigns");
          try {
            const body: { name: string } = await request.json();
            console.log("[DO] Request body:", body);
            if (!body.name) {
              console.log("[DO] Missing name in request body");
              return new Response(
                JSON.stringify({ error: "Name is required" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
            console.log("[DO] About to create campaign with name:", body.name);
            // Extract username from request headers or use default
            const authHeader = request.headers.get("Authorization");
            let username = "default";
            if (authHeader && authHeader.startsWith("Bearer ")) {
              try {
                const token = authHeader.substring(7);
                const payload = JSON.parse(atob(token.split(".")[1]));
                username = payload.username || "default";
              } catch (error) {
                console.error("[DO] Error parsing JWT:", error);
              }
            }
            // Call the proper createCampaign method with username
            const campaign = await this.createCampaign(body.name, username);
            console.log("[DO] Created campaign:", campaign);
            return Response.json({ campaign });
          } catch (error) {
            console.error("[DO] Error processing POST request:", error);
            return new Response(
              JSON.stringify({
                error: "Failed to process request",
                details: String(error),
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
        }
      }

      // Handle campaign resources endpoint
      if (url.pathname.match(/^\/campaigns\/[^/]+\/resources$/)) {
        if (request.method === "GET") {
          console.log("[DO] GET /campaigns/:campaignId/resources");
          // For now, return empty resources array since resources are not fully implemented
          return Response.json({ resources: [] });
        }
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("[DO] Error in fetch handler:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  // TODO: Implement these methods
  /*private async createCampaignHandler(request: Request): Promise<Response> {
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("name" in body) ||
      typeof (body as Record<string, unknown>).name !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid request: name is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { name } = body as CreateCampaignRequest;
    const campaignId = crypto.randomUUID();
    const now = new Date().toISOString();
    this.campaign = {
      campaignId,
      name,
      createdAt: now,
      updatedAt: now,
      resources: [],
    };
    console.debug(`[CampaignManager] Created campaign ${campaignId}`);
    return new Response(
      JSON.stringify({ success: true, campaign: this.campaign }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async addResource(request: Request): Promise<Response> {
    if (!this.campaign) return new Response("No campaign", { status: 404 });
    const resource = await request.json();
    if (
      !resource ||
      typeof resource !== "object" ||
      !("type" in resource) ||
      !("id" in resource) ||
      !("name" in resource) ||
      typeof (resource as Record<string, unknown>).type !== "string" ||
      typeof (resource as Record<string, unknown>).id !== "string" ||
      !(
        typeof (resource as { name?: unknown }).name === "string" &&
        (resource as { name: string }).name.trim()
      )
    ) {
      return new Response(
        JSON.stringify({ error: "Resource name is required" }),
        { status: 400 }
      );
    }
    this.campaign.resources.push(resource as CampaignResource);
    this.campaign.updatedAt = new Date().toISOString();
    console.debug(
      `[CampaignManager] Added resource to ${this.campaign.campaignId}:`,
      resource
    );
    return new Response(
      JSON.stringify({ success: true, resources: this.campaign.resources }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async removeResource(request: Request): Promise<Response> {
    if (!this.campaign) {
      return new Response("No campaign", { status: 404 });
    }
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const resourceId = parts[parts.length - 1];

    // Additional null safety checks
    if (!resourceId || typeof resourceId !== "string") {
      return new Response(
        JSON.stringify({
          error: "Invalid resource ID provided.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Ensure resources array exists and is an array
    if (!this.campaign.resources || !Array.isArray(this.campaign.resources)) {
      return new Response(
        JSON.stringify({
          error: "Campaign resources are not properly initialized.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if the resource exists before attempting to remove it
    const resourceExists = this.campaign.resources.some(
      (r) => r && r.id === resourceId
    );
    if (!resourceExists) {
      return new Response(
        JSON.stringify({
          error: `Resource with ID '${resourceId}' not found in campaign.`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    this.campaign.resources = this.campaign.resources.filter(
      (r) => r && r.id !== resourceId
    );
    this.campaign.updatedAt = new Date().toISOString();
    console.debug(
      `[CampaignManager] Removed resource ${resourceId} from ${this.campaign.campaignId}`
    );
    return new Response(
      JSON.stringify({ success: true, resources: this.campaign.resources }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async listResources(_request: Request): Promise<Response> {
    if (!this.campaign) return new Response("No campaign", { status: 404 });
    return new Response(
      JSON.stringify({ resources: this.campaign.resources }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }*/
}
