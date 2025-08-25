// Import all general tools
import { validateAdminKey } from "./auth-tools";
import { fileRecommendationTools } from "./file-recommendation-tools";

// Export all general tools
export { validateAdminKey } from "./auth-tools";
export { fileRecommendationTools } from "./file-recommendation-tools";

// Export the tools object for backward compatibility
export const generalTools = {
  validateAdminKey,
  ...fileRecommendationTools,
};
