// Campaign context search and storage tools bundle
import {
  searchCampaignContext,
  searchExternalResources,
  listAllEntities,
} from "./search-tools";
import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "./world-state-tools";
import { updateEntityMetadataTool } from "./entity-tools";
import { showCampaignDetails } from "../campaign/core-tools";
import { getMessageHistory } from "../message-history-tools";

export const campaignContextToolsBundle = {
  searchCampaignContext,
  searchExternalResources,
  listAllEntities,
  showCampaignDetails,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
  updateEntityMetadataTool,
  getMessageHistory,
};
