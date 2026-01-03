// Import all general tools
import { validateAdminKey } from "./auth-tools";
import { fileRecommendationTools } from "./file-recommendation-tools";
import { generateContextRecapTool } from "./recap-tools";
import { getMessageHistory } from "../message-history-tools";

// Export all general tools
export { validateAdminKey } from "./auth-tools";
export { fileRecommendationTools } from "./file-recommendation-tools";
export { generateContextRecapTool } from "./recap-tools";
export { getMessageHistory } from "../message-history-tools";

// Export the tools object for backward compatibility
export const generalTools = {
  validateAdminKey,
  ...fileRecommendationTools,
  generateContextRecap: generateContextRecapTool,
  getMessageHistory,
};
