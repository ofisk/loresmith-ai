// Service Factory - Provides cached service instances to reduce memory usage and initialization overhead
// Uses per-request caching to reuse services within the same request context

import type { Env } from "../middleware/auth";
import { AssessmentService } from "./assessment-service";
import { AutoRAGService } from "./autorag-service";
import { AuthService } from "./auth-service";
import { RAGService } from "./rag-service";
import { UploadService } from "./upload-service";
import { StorageService } from "./storage-service";
import { CampaignService } from "./campaign-service";
import { ModelManager } from "./model-manager";
import { AgentRegistryService } from "./agent-registry";
import { AgentRouter } from "./agent-router";

// Service factory class with per-request caching
export class ServiceFactory {
  private static services = new Map<string, any>();

  // Clear services (called between requests to prevent memory leaks)
  static clearCache(): void {
    ServiceFactory.services.clear();
  }

  // Get or create AssessmentService
  static getAssessmentService(env: Env): AssessmentService {
    const key = "assessment";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AssessmentService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create AutoRAGService
  static getAutoRAGService(env: Env): AutoRAGService {
    const key = "autorag";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AutoRAGService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create AuthService
  static getAuthService(env: Env): AuthService {
    const key = "auth";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new AuthService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create RAGService
  static getRagService(env: Env): RAGService {
    const key = "rag";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new RAGService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create UploadService
  static getUploadService(env: Env): UploadService {
    const key = "upload";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new UploadService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create StorageService
  static getStorageService(env: Env): StorageService {
    const key = "storage";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new StorageService(env));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create CampaignService
  static getCampaignService(env: Env): CampaignService {
    const key = "campaign";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, new CampaignService(env.DB));
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create ModelManager (singleton pattern)
  static getModelManager(): ModelManager {
    const key = "model-manager";
    if (!ServiceFactory.services.has(key)) {
      ServiceFactory.services.set(key, ModelManager.getInstance());
    }
    return ServiceFactory.services.get(key);
  }

  // Get or create AgentRegistryService (static class, no instance needed)
  static getAgentRegistryService(): typeof AgentRegistryService {
    return AgentRegistryService;
  }

  // Get or create AgentRouter (static class, no instance needed)
  static getAgentRouter(): typeof AgentRouter {
    return AgentRouter;
  }
}

// Helper functions for backward compatibility
export const getAssessmentService = (env: Env) =>
  ServiceFactory.getAssessmentService(env);

export const getAutoRAGService = (env: Env) =>
  ServiceFactory.getAutoRAGService(env);

export const getAuthService = (env: Env) => ServiceFactory.getAuthService(env);

export const getRagService = (env: Env) => ServiceFactory.getRagService(env);

export const getUploadService = (env: Env) =>
  ServiceFactory.getUploadService(env);

export const getStorageService = (env: Env) =>
  ServiceFactory.getStorageService(env);

export const getCampaignService = (env: Env) =>
  ServiceFactory.getCampaignService(env);

export const getModelManager = () => ServiceFactory.getModelManager();

export const getAgentRegistryService = () =>
  ServiceFactory.getAgentRegistryService();

export const getAgentRouter = () => ServiceFactory.getAgentRouter();
