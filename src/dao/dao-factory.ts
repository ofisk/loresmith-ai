import type { D1Database } from "@cloudflare/workers-types";
import { UserDAO } from "./user-dao";
import type { UserStorageUsage } from "./user-dao";
import { CampaignDAO } from "./campaign-dao";
import { FileDAO } from "./file-dao";

// Cache for DAO factory instances
const daoFactoryCache = new Map<string, DAOFactory>();

// Wrapper to add a stable key to D1Database objects
interface DatabaseWithKey extends D1Database {
  _daoKey?: string;
}

export interface DAOFactory {
  userDAO: UserDAO;
  campaignDAO: CampaignDAO;
  fileDAO: FileDAO;

  // Convenience methods for common operations
  storeOpenAIKey(username: string, apiKey: string): Promise<void>;
  getOpenAIKey(username: string): Promise<string | null>;
  deleteOpenAIKey(username: string): Promise<void>;
  hasOpenAIKey(username: string): Promise<boolean>;
  getStorageUsage(username: string): Promise<UserStorageUsage>;
}

export class DAOFactoryImpl implements DAOFactory {
  public readonly userDAO: UserDAO;
  public readonly campaignDAO: CampaignDAO;
  public readonly fileDAO: FileDAO;

  constructor(db: D1Database) {
    this.userDAO = new UserDAO(db);
    this.campaignDAO = new CampaignDAO(db);
    this.fileDAO = new FileDAO(db);
  }

  // Convenience methods for common operations
  async storeOpenAIKey(username: string, apiKey: string): Promise<void> {
    return this.userDAO.storeOpenAIKey(username, apiKey);
  }

  async getOpenAIKey(username: string): Promise<string | null> {
    return this.userDAO.getOpenAIKey(username);
  }

  async deleteOpenAIKey(username: string): Promise<void> {
    return this.userDAO.deleteOpenAIKey(username);
  }

  async hasOpenAIKey(username: string): Promise<boolean> {
    return this.userDAO.hasOpenAIKey(username);
  }

  async getStorageUsage(username: string): Promise<UserStorageUsage> {
    return this.userDAO.getStorageUsage(username);
  }

  getDAO<
    T extends keyof Omit<
      DAOFactory,
      | "storeOpenAIKey"
      | "getOpenAIKey"
      | "deleteOpenAIKey"
      | "hasOpenAIKey"
      | "getStorageUsage"
    >,
  >(name: T): DAOFactory[T] {
    return this[name];
  }

  async transaction<T>(operations: (() => Promise<T>)[]): Promise<T[]> {
    try {
      return await Promise.all(operations.map((op) => op()));
    } catch (error) {
      console.error("DAO transaction error:", error);
      throw error;
    }
  }
}

// Generate a stable key for a D1Database instance
export function getDatabaseKey(db: D1Database | undefined): string {
  if (!db) {
    // For undefined/null databases, generate a unique key
    return `db-undefined-${Math.random().toString(36).substr(2, 9)}`;
  }

  const dbWithKey = db as DatabaseWithKey;

  // If the database already has a key, use it
  if (dbWithKey._daoKey) {
    return dbWithKey._daoKey;
  }

  // Generate a new key and store it on the database object
  // Use a more stable approach - just use a random string without timestamp
  const key = `db-${Math.random().toString(36).substr(2, 9)}`;
  dbWithKey._daoKey = key;
  return key;
}

export function createDAOFactory(db: D1Database | undefined): DAOFactory {
  if (!db) {
    throw new Error("Cannot create DAO factory with undefined database");
  }

  const factory = new DAOFactoryImpl(db);
  const key = getDatabaseKey(db);
  daoFactoryCache.set(key, factory);
  return factory;
}

export function getDAOFactory(env: { DB: D1Database | undefined }): DAOFactory {
  const key = getDatabaseKey(env.DB);

  if (!daoFactoryCache.has(key)) {
    return createDAOFactory(env.DB!);
  }

  return daoFactoryCache.get(key)!;
}
