// Campaign context search and storage tools bundle
import { getCampaignContext, storeCampaignContext } from "./context-tools";
import { searchCampaignContext, searchExternalResources } from "./search-tools";
import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "./world-state-tools";

export const campaignContextToolsBundle = {
  searchCampaignContext,
  searchExternalResources,
  storeCampaignContext,
  getCampaignContext,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
};
