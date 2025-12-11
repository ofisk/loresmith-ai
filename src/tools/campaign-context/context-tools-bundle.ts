// Campaign context search and storage tools bundle
import {
  getCampaignContext,
  listCampaignCharacters,
  storeCampaignContext,
} from "./context-tools";
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
  listCampaignCharacters,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
};
