// Import all general tools
import { validateAdminKey } from "./auth-tools";
import { fileRecommendationTools } from "./file-recommendation-tools";
import { getMessageHistory } from "../message-history-tools";

// Export all general tools
export { validateAdminKey } from "./auth-tools";
export { fileRecommendationTools } from "./file-recommendation-tools";
export { getMessageHistory } from "../message-history-tools";

// Export the tools object for backward compatibility (recap lives in campaign-context only)
export const generalTools = {
  validateAdminKey,
  ...fileRecommendationTools,
  getMessageHistory,
};
