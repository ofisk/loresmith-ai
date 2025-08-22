// Service Factory - Provides cached service instances to reduce memory usage and initialization overhead
// Uses per-request caching to reuse services within the same request context

import type { Env } from "../middleware/auth";
import { AuthService } from "./auth-service";
import { LibraryRAGService } from "./rag-service";
import { LibraryService } from "./library-service";
import { CampaignService } from "./campaign-service";
import { ModelManager } from "./model-manager";
import { AssessmentService } from "./assessment-service";
import { MetadataService } from "./metadata-service";
import { ErrorHandlingService } from "./error-handling-service";
import { getDatabaseKey } from "../dao/dao-factory";
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
    const key = `assessment-${JSON.stringify(env)}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AssessmentService(env));
    }
    return ServiceFactory.services.get(key) as AssessmentService;
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

    console.log("[ServiceFactory] Creating/getting AuthService:", {
      key,
      hasAdmin: !!env.ADMIN_SECRET,
      adminType: typeof env.ADMIN_SECRET,
      processEnvAdmin: process.env.ADMIN_SECRET ? "present" : "not present",
    });

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

  // Get or create MetadataService
  static getMetadataService(env: Env): MetadataService {
    const key = `metadata-${env.AI ? "has-ai" : "no-ai"}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new MetadataService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create ErrorHandlingService (stateless, can be reused)
  static getErrorHandlingService(): ErrorHandlingService {
    const key = "error-handling";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new ErrorHandlingService());
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create LibraryService
  static getLibraryService(env: Env): LibraryService {
    // Create a more unique key based on environment content
    const envHash = JSON.stringify({
      hasFileBucket: !!env.FILE_BUCKET,
      hasDb: !!env.DB,
      hasAdmin: !!env.ADMIN_SECRET,
    });
    const key = `library-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new LibraryService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create CampaignService
  static getCampaignService(env: Env): CampaignService {
    // Create a more unique key based on environment content and database identity
    const dbKey = getDatabaseKey(env.DB);
    const envHash = JSON.stringify({
      hasDb: !!env.DB,
      hasAdmin: !!env.ADMIN_SECRET,
      hasFileBucket: !!env.FILE_BUCKET,
      dbKey,
    });
    const key = `campaign-${envHash}`;
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new CampaignService(env));
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
    // Create a more unique key based on database identity
    const dbKey = getDatabaseKey(env.DB);
    const key = `agent-registry-${dbKey}`;
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

export const getMetadataService = (env: Env) =>
  ServiceFactory.getMetadataService(env);

export const getErrorHandlingService = () =>
  ServiceFactory.getErrorHandlingService();

export const getLibraryService = (env: Env) =>
  ServiceFactory.getLibraryService(env);

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
