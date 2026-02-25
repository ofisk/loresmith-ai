// Entity graph management tools bundle

import {
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
} from "./community-tools";
import {
	createEntityRelationshipTool,
	extractEntitiesFromContentTool,
} from "./entity-tools";
import { searchCampaignContext } from "./search-tools";

export const entityGraphTools = {
	extractEntitiesFromContentTool,
	createEntityRelationshipTool,
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	searchCampaignContext,
};
