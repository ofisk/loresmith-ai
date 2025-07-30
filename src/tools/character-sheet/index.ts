// Import all character sheet tools

import { createCharacterFromChat } from "./creation-tools";
import { listCharacterSheets } from "./list-tools";
import { processCharacterSheet, uploadCharacterSheet } from "./upload-tools";

export { createCharacterFromChat } from "./creation-tools";
export { listCharacterSheets } from "./list-tools";
// Export all character sheet tools
export { processCharacterSheet, uploadCharacterSheet } from "./upload-tools";

// Export the tools object for backward compatibility
export const characterSheetTools = {
  uploadCharacterSheet,
  processCharacterSheet,
  createCharacterFromChat,
  listCharacterSheets,
};
