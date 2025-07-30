import type { CampaignData, CampaignResource } from "../../types/campaign";

// CampaignTool class for direct Durable Object interactions
export class CampaignTool {
  private campaignManager: DurableObjectNamespace;

  constructor(campaignManager: DurableObjectNamespace) {
    this.campaignManager = campaignManager;
  }

  private getStub(campaignId: string) {
    return this.campaignManager.get(
      this.campaignManager.idFromName(campaignId)
    );
  }

  async getCampaign(campaignId: string): Promise<CampaignData | null> {
    const stub = this.getStub(campaignId);
    const resp = await stub.fetch("https://dummy-host/");
    if (!resp.ok) return null;
    return (await resp.json()) as CampaignData;
  }

  async getResources(campaignId: string): Promise<CampaignResource[] | null> {
    const stub = this.getStub(campaignId);
    const resp = await stub.fetch("https://dummy-host/resources");
    if (!resp.ok) return null;
    const data = (await resp.json()) as { resources: CampaignResource[] };
    return data.resources;
  }

  // Stub: triggerIndexing (not implemented in DO, so just return a dummy response)
  async triggerIndexing(_campaignId: string): Promise<{ success: boolean }> {
    // In a real implementation, this would POST to /index on the DO
    return { success: true };
  }

  // Stub: getContextChunks (not implemented in DO, so just return a dummy response)
  async getContextChunks(_campaignId: string): Promise<string[]> {
    // In a real implementation, this would fetch context chunks from the DO
    return ["[Context chunk 1]", "[Context chunk 2]"];
  }
}

// Usage example (in a Worker):
// const tool = new CampaignTool(env.CampaignManager);
// await tool.getCampaign("my-campaign-id");
