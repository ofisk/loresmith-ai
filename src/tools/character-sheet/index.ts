// Import all character sheet tools

import { createCharacterSheet } from "./creation-tools";
import { uploadCharacterSheet, processCharacterSheet } from "./upload-tools";
import { listCharacterSheets } from "./list-tools";

export { createCharacterSheet } from "./creation-tools";
export { uploadCharacterSheet, processCharacterSheet } from "./upload-tools";
export { listCharacterSheets } from "./list-tools";

// Export the tools object for backward compatibility
export const characterSheetTools = {
  uploadCharacterSheet,
  processCharacterSheet,
  createCharacterSheet,
  listCharacterSheets,
};
