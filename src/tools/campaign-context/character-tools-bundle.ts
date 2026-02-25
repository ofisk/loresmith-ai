// Character management tools bundle

import { showCampaignDetails } from "../campaign/core-tools";
import {
	generateCharacterWithAITool,
	storeCharacterInfo,
} from "./character-tools";
import { deleteEntityTool } from "./entity-tools";
import { getDocumentContent } from "./get-document-content-tool";
import { listAllEntities, searchCampaignContext } from "./search-tools";

export const characterManagementTools = {
	storeCharacterInfo,
	generateCharacterWithAITool,
	listAllEntities,
	searchCampaignContext,
	deleteEntityTool,
	getDocumentContent,
	showCampaignDetails,
};

/** Player-facing subset: create/store characters, search/list (sanitized), campaign details */
export const playerCharacterTools = {
	storeCharacterInfo,
	generateCharacterWithAITool,
	listAllEntities,
	searchCampaignContext,
	showCampaignDetails,
};
