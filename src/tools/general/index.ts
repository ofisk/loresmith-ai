// Import all general tools

import { getMessageHistory } from "@/tools/message-history-tools";
import { fileRecommendationTools } from "./file-recommendation-tools";

export { getMessageHistory } from "@/tools/message-history-tools";
// Export all general tools
export { fileRecommendationTools } from "./file-recommendation-tools";

// Export the tools object for backward compatibility (recap lives in campaign-context only)
export const generalTools = {
	...fileRecommendationTools,
	getMessageHistory,
};
