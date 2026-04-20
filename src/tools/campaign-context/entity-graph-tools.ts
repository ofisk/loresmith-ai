// Entity graph management tools bundle

import { getMessageHistory } from "@/tools/message-history-tools";
import {
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
} from "./community-tools";
import {
	createEntityRelationshipTool,
	extractEntitiesFromContentTool,
	updateEntityTypeTool,
} from "./entity-tools";
import { searchCampaignContext } from "./search-tools";

export const entityGraphTools = {
	extractEntitiesFromContentTool,
	createEntityRelationshipTool,
	updateEntityTypeTool,
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	searchCampaignContext,
	getMessageHistory,
};
