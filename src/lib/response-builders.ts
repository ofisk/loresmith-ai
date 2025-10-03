// Standardized response builders for API endpoints

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
  [key: string]: any;
}

// Build success response
export function buildSuccessResponse<T>(
  data: T,
  message?: string,
  statusCode: number = 200
): { response: ApiResponse<T>; status: number } {
  const response: ApiResponse<T> = { success: true };

  if (message) {
    response.message = message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  return { response, status: statusCode };
}

// Build error response
export function buildErrorResponse(
  error: string,
  statusCode: number = 500
): { response: ApiResponse; status: number } {
  return {
    response: { success: false, error },
    status: statusCode,
  };
}

// Build shard generation response
export function buildShardGenerationResponse(
  resource: any,
  shardCount: number,
  campaignId: string,
  serverGroups?: any[]
) {
  const response: ApiResponse = {
    success: true,
    message: `Resource added to campaign successfully. Generated ${shardCount} shards for review.`,
    resource: {
      id: resource.id,
      name: resource.file_name || resource.id,
      type: "file",
    },
  };

  if (shardCount > 0 && serverGroups) {
    response.shards = {
      count: shardCount,
      campaignId,
      resourceId: resource.id,
      groups: serverGroups,
      message: `Generated ${shardCount} shards from "${resource.file_name || resource.id}".`,
    };

    response.ui_hint = {
      type: "shards_ready",
      data: {
        campaignId,
        resourceId: resource.id,
        groups: serverGroups,
      },
    };
  }

  return response;
}

// Build resource addition response (no shards)
export function buildResourceAdditionResponse(
  resource: any,
  message: string = "Resource added to campaign successfully."
) {
  return {
    success: true,
    message,
    resource: {
      id: resource.id,
      name: resource.file_name || resource.id,
      type: "file",
    },
  };
}

// Build campaign creation response
export function buildCampaignCreationResponse(campaign: any) {
  return {
    success: true,
    campaign,
  };
}

// Build campaign update response
export function buildCampaignUpdateResponse(campaign: any) {
  return {
    success: true,
    message: "Campaign updated successfully",
    campaign,
  };
}

// Build campaign deletion response
export function buildCampaignDeletionResponse(deletedCampaign: any) {
  return {
    success: true,
    message: "Campaign deleted successfully",
    deletedCampaign,
  };
}

// Build bulk deletion response
export function buildBulkDeletionResponse(deletedCampaigns: any[]) {
  if (deletedCampaigns.length === 0) {
    return {
      success: true,
      message: "No campaigns found to delete",
      deletedCount: 0,
    };
  }

  return {
    success: true,
    message: "All campaigns deleted successfully",
    deletedCount: deletedCampaigns.length,
    deletedCampaigns,
  };
}

// Build resource removal response
export function buildResourceRemovalResponse(removedResource: any) {
  return {
    success: true,
    message: "Resource removed from campaign successfully",
    removedResource,
  };
}
