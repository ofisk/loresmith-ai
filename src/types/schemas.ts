/**
 * Centralized schema definitions for consistent data handling across the application
 */

// Campaign schema
export interface Campaign {
  id: string;
  name: string;
  description: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignResponse {
  campaigns: Campaign[];
}

export const CAMPAIGN_SCHEMA = {
  TABLE_NAME: "campaigns",
  COLUMNS: {
    ID: "id",
    NAME: "name",
    DESCRIPTION: "description",
    USERNAME: "username",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  },
} as const;

// Character schema
export interface Character {
  id: string;
  name: string;
  description: string;
  campaign_id: string;
  created_at: string;
  updated_at: string;
}

export interface CharacterResponse {
  characters: Character[];
}

export const CHARACTER_SCHEMA = {
  TABLE_NAME: "campaign_characters",
  COLUMNS: {
    ID: "id",
    NAME: "name",
    DESCRIPTION: "description",
    CAMPAIGN_ID: "campaign_id",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  },
} as const;

// Resource schema
export interface Resource {
  id: string;
  type: string;
  name: string;
  description: string;
  campaign_id: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceResponse {
  resources: Resource[];
}

export const RESOURCE_SCHEMA = {
  TABLE_NAME: "campaign_resources",
  COLUMNS: {
    ID: "id",
    TYPE: "type",
    NAME: "name",
    DESCRIPTION: "description",
    CAMPAIGN_ID: "campaign_id",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  },
} as const;

// Context schema
export interface Context {
  id: string;
  content: string;
  type: string;
  campaign_id: string;
  created_at: string;
  updated_at: string;
}

export interface ContextResponse {
  contexts: Context[];
}

export const CONTEXT_SCHEMA = {
  TABLE_NAME: "campaign_context",
  COLUMNS: {
    ID: "id",
    CONTENT: "content",
    TYPE: "type",
    CAMPAIGN_ID: "campaign_id",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  },
} as const;

// User schema
export interface User {
  username: string;
  openai_api_key: string;
  created_at: string;
  updated_at: string;
}

export const USER_SCHEMA = {
  TABLE_NAME: "users",
  COLUMNS: {
    USERNAME: "username",
    OPENAI_API_KEY: "openai_api_key",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  },
} as const;

// Generic helper functions
export const schemaHelpers = {
  /**
   * Build a SELECT query with all columns for a given schema
   */
  buildSelectQuery: (schema: {
    TABLE_NAME: string;
    COLUMNS: Record<string, string>;
  }): string => {
    const columns = Object.values(schema.COLUMNS);
    return `SELECT ${columns.join(", ")} FROM ${schema.TABLE_NAME}`;
  },

  /**
   * Build a WHERE clause for a given column
   */
  buildWhereClause: (column: string, operator: string = "="): string => {
    return `${column} ${operator} ?`;
  },

  /**
   * Build an ORDER BY clause
   */
  buildOrderByClause: (
    column: string,
    direction: "ASC" | "DESC" = "DESC"
  ): string => {
    return `ORDER BY ${column} ${direction}`;
  },
};
