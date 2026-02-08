// Import all character sheet tools

import { getDocumentContent } from "@/tools/campaign-context/get-document-content-tool";
import { createCharacterSheet } from "./creation-tools";
import { listCharacterSheets } from "./list-tools";
import { processCharacterSheet, uploadCharacterSheet } from "./upload-tools";

export { createCharacterSheet } from "./creation-tools";
export { listCharacterSheets } from "./list-tools";
export { processCharacterSheet, uploadCharacterSheet } from "./upload-tools";

// Export the tools object for backward compatibility
export const characterSheetTools = {
  uploadCharacterSheet,
  processCharacterSheet,
  createCharacterSheet,
  listCharacterSheets,
  getDocumentContent,
};
