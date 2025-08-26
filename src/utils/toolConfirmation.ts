import type { generalTools } from "../tools/general";
import type { campaignTools } from "../tools/campaign";
import type { fileTools } from "../tools/file";

// List of tools that require human confirmation
// Any create, update, or delete operations should require confirmation for safety
export const toolsRequiringConfirmation: (
  | keyof typeof generalTools
  | keyof typeof campaignTools
  | keyof typeof fileTools
)[] = [
  // Campaign CRUD operations
  "createCampaign",
  "deleteCampaign",
  "deleteCampaigns",
  "addResourceToCampaign",
  "removeResourceFromCampaign",

  // File CRUD operations
  "deleteFile",
  "updateFileMetadata",
  "autoGenerateFileMetadata",
];
