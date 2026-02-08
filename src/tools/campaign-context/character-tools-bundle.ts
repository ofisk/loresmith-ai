// Character management tools bundle
import {
  storeCharacterInfo,
  generateCharacterWithAITool,
} from "./character-tools";
import { getDocumentContent } from "./get-document-content-tool";
import { listAllEntities, searchCampaignContext } from "./search-tools";
import { deleteEntityTool } from "./entity-tools";

export const characterManagementTools = {
  storeCharacterInfo,
  generateCharacterWithAITool,
  listAllEntities,
  searchCampaignContext,
  deleteEntityTool,
  getDocumentContent,
};
