// Campaign context search and storage tools bundle
import { searchCampaignContext, searchExternalResources } from "./search-tools";
import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "./world-state-tools";

export const campaignContextToolsBundle = {
  searchCampaignContext,
  searchExternalResources,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
};
