import { DurableObject } from "cloudflare:workers";

//TODO: Expand on image? Could we use multiple forms of media / collections of media?
export type ResourceType = "pdf" | "character" | "note" | "image";

export interface CampaignResource {
  type: ResourceType;
  id: string;
  name?: string;
}

export interface CampaignData {
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  resources: CampaignResource[];
}

export class CampaignManager extends DurableObject {
  private campaign: CampaignData | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Logging for all requests
    console.debug(`[CampaignManager] ${method} ${path}`);

    try {
      if (path.endsWith("/create") && method === "POST") {
        return await this.createCampaign(request);
      }
      if (path.match(/\/resource$/) && method === "POST") {
        return await this.addResource(request);
      }
      if (path.match(/\/resource\/[\w-]+$/) && method === "DELETE") {
        return await this.removeResource(request);
      }
      if (path.match(/\/resources$/) && method === "GET") {
        return await this.listResources(request);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("[CampaignManager] Error:", err);
      return new Response("Internal server error", { status: 500 });
    }
  }

  private async createCampaign(request: Request): Promise<Response> {
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
    const { name } = body as { name: string };
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
      typeof (resource as Record<string, unknown>).type !== "string" ||
      typeof (resource as Record<string, unknown>).id !== "string"
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid resource: type and id are required.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
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

  private async listResources(request: Request): Promise<Response> {
    if (!this.campaign) return new Response("No campaign", { status: 404 });
    return new Response(
      JSON.stringify({ resources: this.campaign.resources }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
