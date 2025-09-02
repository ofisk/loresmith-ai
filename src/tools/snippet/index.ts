/**
 * Snippet Tools Index
 * Exports all tools related to snippet operations
 */

export {
  discoverSnippetsTool,
  searchApprovedSnippetsTool,
  getSnippetStatsTool,
} from "./snippet-discovery-tools";
export {
  approveSnippetsTool,
  rejectSnippetsTool,
  createSnippetsTool,
  getSnippetDetailsTool,
} from "./snippet-management-tools";
export {
  renderSnippetManagementUITool,
  renderSnippetApprovalUITool,
} from "./snippet-ui-tools";

export const snippetTools = [
  "discoverSnippetsTool",
  "searchApprovedSnippetsTool",
  "getSnippetStatsTool",
  "approveSnippetsTool",
  "rejectSnippetsTool",
  "createSnippetsTool",
  "getSnippetDetailsTool",
  "renderSnippetManagementUITool",
  "renderSnippetApprovalUITool",
] as const;
