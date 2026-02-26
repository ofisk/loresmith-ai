// Re-export campaign tools for tests and consumers that import from src/tools
import {
	addResourceToCampaign,
	createCampaign,
	listCampaignResources,
	showCampaignDetails,
} from "./campaign";

export const tools = {
	createCampaign,
	listCampaignResources,
	addResourceToCampaign,
	showCampaignDetails,
};

// Execution functions extracted from AI SDK tools (execute property)
export const executions = {
	createCampaign: createCampaign.execute,
	listCampaignResources: listCampaignResources.execute,
	addResourceToCampaign: addResourceToCampaign.execute,
	showCampaignDetails: showCampaignDetails.execute,
};
