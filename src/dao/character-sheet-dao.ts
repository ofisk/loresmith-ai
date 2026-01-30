import { BaseDAOClass } from "./base-dao";

/**
 * Row shape returned from getByIdAndUsername (character_sheets joined with campaigns.username).
 */
export interface CharacterSheetRow {
  id: string;
  campaign_id: string;
  character_name: string;
  character_class?: string;
  character_level?: number;
  character_race?: string;
  file_name?: string;
  file_content?: string;
  file_size?: number;
  processed_data?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  username?: string;
}

export interface CreateCharacterSheetFormParams {
  id: string;
  campaignId: string;
  characterName: string;
  characterClass: string;
  characterLevel: number;
  characterRace: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterSheetFileParams {
  id: string;
  campaignId: string;
  characterName: string;
  fileName: string;
  fileContent: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

/** Summary row for listing character sheets (no file_content). */
export interface CharacterSheetListItem {
  id: string;
  characterName: string;
  fileName?: string;
  fileType: string;
  status: string;
  createdAt: string;
}

/**
 * DAO for the character_sheets table. Used by character-sheet tools (create, upload, process).
 */
export class CharacterSheetDAO extends BaseDAOClass {
  /**
   * Create a character sheet from form fields (no file).
   */
  async createFromForm(params: CreateCharacterSheetFormParams): Promise<void> {
    const sql = `
      INSERT INTO character_sheets (
        id, campaign_id, character_name, character_class, character_level, character_race,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      params.id,
      params.campaignId,
      params.characterName,
      params.characterClass,
      params.characterLevel,
      params.characterRace,
      params.createdAt,
      params.updatedAt,
    ]);
  }

  /**
   * Create a character sheet from an uploaded file (file_name, file_content, file_size).
   */
  async createFromFile(params: CreateCharacterSheetFileParams): Promise<void> {
    const sql = `
      INSERT INTO character_sheets (
        id, campaign_id, character_name, file_name, file_content, file_size,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      params.id,
      params.campaignId,
      params.characterName,
      params.fileName,
      params.fileContent,
      params.fileSize,
      params.createdAt,
      params.updatedAt,
    ]);
  }

  /**
   * Get a character sheet by id, only if it belongs to a campaign owned by the given username.
   */
  async getByIdAndUsername(
    characterSheetId: string,
    username: string
  ): Promise<CharacterSheetRow | null> {
    const sql = `
      SELECT cs.*, c.username
      FROM character_sheets cs
      JOIN campaigns c ON cs.campaign_id = c.id
      WHERE cs.id = ? AND c.username = ?
    `;
    const row = await this.queryFirst<Record<string, unknown>>(sql, [
      characterSheetId,
      username,
    ]);
    if (!row) return null;
    return {
      id: row.id as string,
      campaign_id: row.campaign_id as string,
      character_name: row.character_name as string,
      character_class: row.character_class as string | undefined,
      character_level: row.character_level as number | undefined,
      character_race: row.character_race as string | undefined,
      file_name: row.file_name as string | undefined,
      file_content: row.file_content as string | undefined,
      file_size: row.file_size as number | undefined,
      processed_data: row.processed_data as string | undefined,
      processed_at: row.processed_at as string | undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      username: row.username as string | undefined,
    };
  }

  /**
   * List character sheets for a campaign (caller must have verified campaign access).
   * Returns summary items only (no file_content).
   */
  async listByCampaign(campaignId: string): Promise<CharacterSheetListItem[]> {
    const sql = `
      SELECT id, character_name, file_name, processed_at, created_at
      FROM character_sheets
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `;
    const rows = await this.queryAll<Record<string, unknown>>(sql, [
      campaignId,
    ]);
    return rows.map((row) => {
      const hasFile = row.file_name != null && row.file_name !== "";
      const fileType = hasFile
        ? (row.file_name as string).split(".").pop()?.toLowerCase() || "file"
        : "form";
      return {
        id: row.id as string,
        characterName: row.character_name as string,
        fileName: row.file_name as string | undefined,
        fileType,
        status: row.processed_at ? "processed" : "pending",
        createdAt: row.created_at as string,
      };
    });
  }

  /**
   * Update processed_data, processed_at, and updated_at for a character sheet.
   */
  async updateProcessedData(
    characterSheetId: string,
    processedData: string,
    processedAt: string,
    updatedAt: string
  ): Promise<void> {
    const sql = `
      UPDATE character_sheets
      SET processed_data = ?, processed_at = ?, updated_at = ?
      WHERE id = ?
    `;
    await this.execute(sql, [
      processedData,
      processedAt,
      updatedAt,
      characterSheetId,
    ]);
  }
}
