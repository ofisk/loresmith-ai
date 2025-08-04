// Import all general tools
import { validateAdminKey } from "./auth-tools";

// Export all general tools
export { validateAdminKey } from "./auth-tools";

// Export the tools object for backward compatibility
export const generalTools = {
  validateAdminKey,
};
