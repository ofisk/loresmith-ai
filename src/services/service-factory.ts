// Service Factory - Provides cached service instances to reduce memory usage and initialization overhead
// Uses per-request caching to reuse services within the same request context

import type { Env } from "../middleware/auth";
import { AssessmentService } from "./assessment-service";
import { AuthService } from "./auth-service";
import { LibraryRAGService } from "./rag-service";
import { UploadService } from "./upload-service";
import { StorageService } from "./storage-service";
import { CampaignService } from "./campaign-service";
import { ModelManager } from "./model-manager";
import { AgentRegistryService } from "./agent-registry";
import { AgentRouter } from "./agent-router";
import { CampaignRAGService } from "../lib/campaignRag";

// Service factory class with per-request caching
export class ServiceFactory {
  private static services = new Map<string, any>();

  // Clear services (called between requests to prevent memory leaks)
  static clearCache(): void {
    ServiceFactory.services.clear();
  }

  // Get or create AssessmentService
  static getAssessmentService(env: Env): AssessmentService {
    const key = `assessment-${env.ADMIN_SECRET ? "has-admin" : "no-admin"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AssessmentService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create AuthService
  static getAuthService(env: Env): AuthService {
    // Create a more unique key based on environment content
    const envHash = JSON.stringify({
      hasAdmin: !!env.ADMIN_SECRET,
      adminType: typeof env.ADMIN_SECRET,
      hasDb: !!env.DB,
      hasFileBucket: !!env.FILE_BUCKET,
      hasAi: !!env.AI,
    });
    const key = `auth-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AuthService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create LibraryRAGService
  static getLibraryRagService(env: Env): LibraryRAGService {
    const key = `library-rag-${env.AI ? "has-ai" : "no-ai"}-${env.DB ? "has-db" : "no-db"}-${env.VECTORIZE ? "has-vectorize" : "no-vectorize"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new LibraryRAGService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create UploadService
  static getUploadService(env: Env): UploadService {
    const key = `upload-${env.DB ? "has-db" : "no-db"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new UploadService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create StorageService
  static getStorageService(env: Env): StorageService {
    // Create a more unique key based on environment content
    const envHash = JSON.stringify({
      hasFileBucket: !!env.FILE_BUCKET,
      hasDb: !!env.DB,
      hasAdmin: !!env.ADMIN_SECRET,
    });
    const key = `storage-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new StorageService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create CampaignService
  static getCampaignService(env: Env): CampaignService {
    // Create a more unique key based on environment content
    const envHash = JSON.stringify({
      hasDb: !!env.DB,
      hasAdmin: !!env.ADMIN_SECRET,
      hasFileBucket: !!env.FILE_BUCKET,
    });
    const key = `campaign-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new CampaignService(env.DB));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create ModelManager (singleton pattern)
  static getModelManager(env: Env): ModelManager {
    // Create a more unique key based on environment content
    const envHash = JSON.stringify({
      hasAi: !!env.AI,
      hasAdmin: !!env.ADMIN_SECRET,
      hasDb: !!env.DB,
    });
    const key = `model-manager-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, ModelManager.getInstance());
    }
    return ServiceFactory.services.get(key);
  }

  /**
   * Get agent registry service
   */
  static getAgentRegistryService(env: Env): AgentRegistryService {
    const key = `agent-registry-${env.DB ? "has-db" : "no-db"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AgentRegistryService());
    }
    return ServiceFactory.services.get(key);
  }

  /**
   * Initialize agent registry (async)
   */
  static async initializeAgentRegistry(_env: Env): Promise<void> {
    await AgentRegistryService.initialize();
  }

  // Get or create CampaignRAGService
  static getCampaignRAGService(env: Env): CampaignRAGService {
    const key = `campaign-rag-${env.DB ? "has-db" : "no-db"}-${env.VECTORIZE ? "has-vectorize" : "no-vectorize"}-${env.OPENAI_API_KEY ? "has-openai" : "no-openai"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(
        key,
        new CampaignRAGService(env.DB, env.VECTORIZE, env.OPENAI_API_KEY || "")
      );
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create AgentRouter (static class, no instance needed)
  static getAgentRouter(env: Env): typeof AgentRouter {
    const key = `agent-router-${env.DB ? "has-db" : "no-db"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, AgentRouter);
    }
    return ServiceFactory.services.get(key);
  }
}

// Helper functions for backward compatibility
export const getAssessmentService = (env: Env) =>
  ServiceFactory.getAssessmentService(env);

export const getAuthService = (env: Env) => ServiceFactory.getAuthService(env);

export const getLibraryRagService = (env: Env) =>
  ServiceFactory.getLibraryRagService(env);

export const getUploadService = (env: Env) =>
  ServiceFactory.getUploadService(env);

export const getStorageService = (env: Env) =>
  ServiceFactory.getStorageService(env);

export const getCampaignService = (env: Env) =>
  ServiceFactory.getCampaignService(env);

export const getModelManager = (env: Env) =>
  ServiceFactory.getModelManager(env);

export const getAgentRegistryService = (env: Env) =>
  ServiceFactory.getAgentRegistryService(env);

export const initializeAgentRegistry = (env: Env) =>
  ServiceFactory.initializeAgentRegistry(env);

export const getCampaignRAGService = (env: Env) =>
  ServiceFactory.getCampaignRAGService(env);

export const getAgentRouter = (env: Env) => ServiceFactory.getAgentRouter(env);
