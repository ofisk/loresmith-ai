// Entity graph management tools bundle

import { getMessageHistory } from "@/tools/message-history-tools";
import {
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
} from "./community-tools";
import {
	createEntityRelationshipTool,
	updateEntityTypeTool,
} from "./entity-tools";
import { searchCampaignContext } from "./search-tools";

export const entityGraphTools = {
	createEntityRelationshipTool,
	updateEntityTypeTool,
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	searchCampaignContext,
	getMessageHistory,
};
