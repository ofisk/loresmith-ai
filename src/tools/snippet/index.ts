/**
 * Snippet Tools Index
 * Exports all tools related to snippet operations
 */

import {
  discoverSnippetsTool,
  searchApprovedSnippetsTool,
  getSnippetStatsTool,
  debugAllSnippetsTool,
} from "./snippet-discovery-tools";
import {
  approveSnippetsTool,
  rejectSnippetsTool,
  createSnippetsTool,
  getSnippetDetailsTool,
} from "./snippet-management-tools";
import {
  renderSnippetManagementUITool,
  renderSnippetApprovalUITool,
} from "./snippet-ui-tools";

export {
  discoverSnippetsTool,
  searchApprovedSnippetsTool,
  getSnippetStatsTool,
  debugAllSnippetsTool,
  approveSnippetsTool,
  rejectSnippetsTool,
  createSnippetsTool,
  getSnippetDetailsTool,
  renderSnippetManagementUITool,
  renderSnippetApprovalUITool,
};

// Registry object (Record<string, tool>) required by BaseAgent
export const snippetTools = {
  discoverSnippetsTool,
  searchApprovedSnippetsTool,
  getSnippetStatsTool,
  debugAllSnippetsTool,
  approveSnippetsTool,
  rejectSnippetsTool,
  createSnippetsTool,
  getSnippetDetailsTool,
  renderSnippetManagementUITool,
  renderSnippetApprovalUITool,
} as const;
