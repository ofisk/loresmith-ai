/**
 * Shard Tools Index
 * Exports all tools related to shard operations
 */

import {
  debugAllShardsTool,
  discoverShardsTool,
  extractCampaignNameFromMessageTool,
  getAllCampaignsTool,
  getShardStatsTool,
  searchApprovedShardsTool,
} from "./shard-discovery-tools";
import {
  approveShardsTool,
  createShardsTool,
  getShardDetailsTool,
  rejectShardsTool,
} from "./shard-management-tools";
import {
  renderShardApprovalUITool,
  renderShardManagementUITool,
} from "./shard-ui-tools";

export {
  discoverShardsTool,
  searchApprovedShardsTool,
  getShardStatsTool,
  debugAllShardsTool,
  getAllCampaignsTool,
  extractCampaignNameFromMessageTool,
  approveShardsTool,
  rejectShardsTool,
  createShardsTool,
  getShardDetailsTool,
  renderShardManagementUITool,
  renderShardApprovalUITool,
};

// Registry object (Record<string, tool>) required by BaseAgent
export const shardTools = {
  discoverShardsTool,
  searchApprovedShardsTool,
  getShardStatsTool,
  debugAllShardsTool,
  getAllCampaignsTool,
  extractCampaignNameFromMessageTool,
  approveShardsTool,
  rejectShardsTool,
  createShardsTool,
  getShardDetailsTool,
  renderShardManagementUITool,
  renderShardApprovalUITool,
} as const;
