// Character management tools bundle

import { showCampaignDetails } from "@/tools/campaign/core-tools";
import { getMessageHistory } from "@/tools/message-history-tools";
import {
	completePlayerCharacterOnboarding,
	generateCharacterWithAITool,
	storeCharacterInfo,
	updateCharacterInfo,
} from "./character-tools";
import { deleteEntityTool } from "./entity-tools";
import { getDocumentContent } from "./get-document-content-tool";
import { listAllEntities, searchCampaignContext } from "./search-tools";

export const characterManagementTools = {
	storeCharacterInfo,
	updateCharacterInfo,
	generateCharacterWithAITool,
	completePlayerCharacterOnboarding,
	listAllEntities,
	searchCampaignContext,
	deleteEntityTool,
	getDocumentContent,
	showCampaignDetails,
	getMessageHistory,
};

/** Player-facing subset: create/store/update characters, search/list (sanitized), campaign details */
export const playerCharacterTools = {
	storeCharacterInfo,
	updateCharacterInfo,
	generateCharacterWithAITool,
	completePlayerCharacterOnboarding,
	listAllEntities,
	searchCampaignContext,
	showCampaignDetails,
	getMessageHistory,
};
