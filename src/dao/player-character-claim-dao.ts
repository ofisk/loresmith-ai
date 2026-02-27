import { BaseDAOClass } from "./base-dao";

export interface PlayerCharacterClaimRecord {
	campaign_id: string;
	username: string;
	entity_id: string;
	assigned_by: string;
	created_at: string;
	updated_at: string;
}

export interface PlayerCharacterClaim {
	campaignId: string;
	username: string;
	entityId: string;
	assignedBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface PlayerCharacterOption {
	id: string;
	name: string;
	entityType: string;
	content: unknown;
	metadata: unknown;
}

export class PlayerCharacterClaimDAO extends BaseDAOClass {
	private async hasClaimsTable(): Promise<boolean> {
		return this.hasTable("campaign_player_character_claims");
	}

	async getClaimForUser(
		campaignId: string,
		username: string
	): Promise<PlayerCharacterClaim | null> {
		if (!(await this.hasClaimsTable())) return null;

		const sql = `
      SELECT campaign_id, username, entity_id, assigned_by, created_at, updated_at
      FROM campaign_player_character_claims
      WHERE campaign_id = ? AND username = ?
    `;
		const row = await this.queryFirst<PlayerCharacterClaimRecord>(sql, [
			campaignId,
			username,
		]);
		return row ? this.mapClaim(row) : null;
	}

	async listClaimsForCampaign(
		campaignId: string
	): Promise<PlayerCharacterClaim[]> {
		if (!(await this.hasClaimsTable())) return [];

		const sql = `
      SELECT campaign_id, username, entity_id, assigned_by, created_at, updated_at
      FROM campaign_player_character_claims
      WHERE campaign_id = ?
      ORDER BY username ASC
    `;
		const rows = await this.queryAll<PlayerCharacterClaimRecord>(sql, [
			campaignId,
		]);
		return rows.map((row) => this.mapClaim(row));
	}

	async listUnclaimedPcEntities(
		campaignId: string
	): Promise<PlayerCharacterOption[]> {
		const claimsEnabled = await this.hasClaimsTable();
		const sql = claimsEnabled
			? `
        SELECT e.id, e.name, e.entity_type, e.content, e.metadata
        FROM entities e
        LEFT JOIN campaign_player_character_claims c
          ON c.campaign_id = e.campaign_id AND c.entity_id = e.id
        WHERE e.campaign_id = ?
          AND lower(e.entity_type) IN ('pcs', 'pc')
          AND c.entity_id IS NULL
        ORDER BY e.name ASC
      `
			: `
        SELECT e.id, e.name, e.entity_type, e.content, e.metadata
        FROM entities e
        WHERE e.campaign_id = ?
          AND lower(e.entity_type) IN ('pcs', 'pc')
        ORDER BY e.name ASC
      `;

		const rows = await this.queryAll<{
			id: string;
			name: string;
			entity_type: string;
			content: string | null;
			metadata: string | null;
		}>(sql, [campaignId]);

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			entityType: row.entity_type,
			content: this.parseJsonSafely(row.content),
			metadata: this.parseJsonSafely(row.metadata),
		}));
	}

	async upsertClaim(
		campaignId: string,
		username: string,
		entityId: string,
		assignedBy: string
	): Promise<void> {
		if (!(await this.hasClaimsTable())) {
			throw new Error("Player character claims are not available");
		}

		const entity = await this.queryFirst<{
			id: string;
			entity_type: string;
			campaign_id: string;
		}>(
			`
        SELECT id, entity_type, campaign_id
        FROM entities
        WHERE id = ? AND campaign_id = ?
      `,
			[entityId, campaignId]
		);

		if (!entity) {
			throw new Error("Selected character entity was not found");
		}

		const normalizedType = entity.entity_type.toLowerCase();
		if (normalizedType !== "pcs" && normalizedType !== "pc") {
			throw new Error("Selected entity must be a player character");
		}

		const sql = `
      INSERT INTO campaign_player_character_claims (
        campaign_id, username, entity_id, assigned_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(campaign_id, username)
      DO UPDATE SET
        entity_id = excluded.entity_id,
        assigned_by = excluded.assigned_by,
        updated_at = CURRENT_TIMESTAMP
    `;
		await this.execute(sql, [campaignId, username, entityId, assignedBy]);
	}

	async clearClaim(campaignId: string, username: string): Promise<void> {
		if (!(await this.hasClaimsTable())) return;
		await this.execute(
			`
      DELETE FROM campaign_player_character_claims
      WHERE campaign_id = ? AND username = ?
    `,
			[campaignId, username]
		);
	}

	private mapClaim(row: PlayerCharacterClaimRecord): PlayerCharacterClaim {
		return {
			campaignId: row.campaign_id,
			username: row.username,
			entityId: row.entity_id,
			assignedBy: row.assigned_by,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private parseJsonSafely(input: string | null): unknown {
		if (!input) return null;
		try {
			return JSON.parse(input);
		} catch {
			return input;
		}
	}
}
