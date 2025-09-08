// Tools that require user confirmation before execution
export const toolsRequiringConfirmation = [
  // Campaign CRUD operations
  "createCampaign",
  "updateCampaign",
  "deleteCampaign",
  "deleteAllCampaigns",
  "addResourceToCampaign",
  "removeResourceFromCampaign",

  // File CRUD operations
  "deleteFile",
  "updateFileMetadata",

  // Character sheet CRUD operations
  "createCharacterSheet",
  "updateCharacterSheet",
  "deleteCharacterSheet",

  // Assessment CRUD operations
  "createAssessment",
  "updateAssessment",
  "deleteAssessment",
];
