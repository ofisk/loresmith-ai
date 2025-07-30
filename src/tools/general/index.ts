// Import all general tools
import { setAdminSecret } from "./auth-tools";

// Export all general tools
export { setAdminSecret } from "./auth-tools";

// Export the tools object for backward compatibility
export const generalTools = {
  setAdminSecret,
};
