// Common campaign operations and utilities
import { getDAOFactory } from "../dao/dao-factory";
import {
  notifyCampaignCreated,
  notifyCampaignFileAdded,
} from "./notifications";

export interface CreateCampaignOptions {
  env: any;
  username: string;
  name: string;
  description?: string;
}

export interface AddResourceOptions {
  env: any;
  username: string;
  campaignId: string;
  resourceId: string;
  fileKey: string;
  fileName: string;
}

// Create a new campaign with AutoRAG initialization
export async function createCampaign(options: CreateCampaignOptions) {
  const { env, username, name, description = "" } = options;

  const campaignId = crypto.randomUUID();
  const campaignRagBasePath = `campaigns/${campaignId}`;
  const now = new Date().toISOString();

  // Create campaign using DAO
  const campaignDAO = getDAOFactory(env).campaignDAO;
  console.log(`[CampaignOps] Creating campaign in database: ${campaignId}`);

  try {
    await campaignDAO.createCampaign(
      campaignId,
      name,
      username,
      description,
      campaignRagBasePath
    );
    console.log(
      `[CampaignOps] Campaign created successfully in database: ${campaignId}`
    );
  } catch (dbError) {
    console.error(
      `[CampaignOps] Database error creating campaign ${campaignId}:`,
      dbError
    );
    throw dbError;
  }

  const newCampaign = {
    campaignId,
    name,
    description,
    campaignRagBasePath,
    createdAt: now,
    updatedAt: now,
  };

  console.log(
    `[CampaignOps] Created campaign: ${campaignId} for user ${username}`
  );

  // Notify campaign creation
  try {
    await notifyCampaignCreated(env, username, name, description);
  } catch (_e) {}

  return newCampaign;
}

// Add a resource to a campaign
export async function addResourceToCampaign(options: AddResourceOptions) {
  const { env, username, campaignId, resourceId, fileKey, fileName } = options;

  const campaignDAO = getDAOFactory(env).campaignDAO;

  await campaignDAO.addFileResourceToCampaign(
    resourceId,
    campaignId,
    fileKey,
    fileName,
    "",
    "[]",
    "active"
  );

  console.log(
    `[CampaignOps] Added resource ${fileKey} to campaign ${campaignId}`
  );

  // Get campaign for notification
  const campaign = await campaignDAO.getCampaignById(campaignId);
  if (campaign) {
    try {
      await notifyCampaignFileAdded(env, username, campaign.name, fileName);
    } catch (_e) {}
  }

  return {
    id: resourceId,
    campaignId,
    fileKey,
    fileName,
    description: "",
    tags: "[]",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Check if resource already exists in campaign (idempotency check)
export async function checkResourceExists(
  campaignId: string,
  fileKey: string,
  env: any
) {
  const campaignDAO = getDAOFactory(env).campaignDAO;
  const existingResource = await campaignDAO.getFileResourceByFileKey(
    campaignId,
    fileKey
  );

  if (existingResource) {
    return {
      exists: true,
      resource: {
        id: existingResource.id,
        campaignId,
        fileKey,
        fileName: existingResource.file_name,
        description: "",
        tags: "[]",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  return { exists: false };
}

// Validate campaign ownership
export async function validateCampaignOwnership(
  campaignId: string,
  username: string,
  env: any
) {
  const campaignDAO = getDAOFactory(env).campaignDAO;
  const campaign = await campaignDAO.getCampaignById(campaignId);

  if (!campaign || campaign.username !== username) {
    return { valid: false, campaign: null };
  }

  return { valid: true, campaign };
}

// Get campaign RAG base path
export async function getCampaignRagBasePath(
  username: string,
  campaignId: string,
  env: any
) {
  const campaignDAO = getDAOFactory(env).campaignDAO;
  return await campaignDAO.getCampaignRagBasePath(username, campaignId);
}
