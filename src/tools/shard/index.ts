/**
 * Shard Tools Index
 * Exports all tools related to shard operations
 */

import {
  discoverShardsTool,
  searchApprovedShardsTool,
  getShardStatsTool,
  debugAllShardsTool,
  getAllCampaignsTool,
  extractCampaignNameFromMessageTool,
} from "./shard-discovery-tools";
import {
  approveShardsTool,
  rejectShardsTool,
  createShardsTool,
  getShardDetailsTool,
} from "./shard-management-tools";
import {
  renderShardManagementUITool,
  renderShardApprovalUITool,
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
