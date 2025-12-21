// Entity graph management tools bundle
import {
  extractEntitiesFromContentTool,
  createEntityRelationshipTool,
} from "./entity-tools";
import {
  detectCommunitiesTool,
  getCommunitiesTool,
  getCommunityHierarchyTool,
} from "./community-tools";
import { searchCampaignContext } from "./search-tools";

export const entityGraphTools = {
  extractEntitiesFromContentTool,
  createEntityRelationshipTool,
  detectCommunitiesTool,
  getCommunitiesTool,
  getCommunityHierarchyTool,
  searchCampaignContext,
};
