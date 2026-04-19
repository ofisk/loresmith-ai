import { BaseDAOClass } from "@/dao/base-dao";

export type LibraryDiscoveryStatus =
	| "pending"
	| "processing"
	| "complete"
	| "failed";

export interface LibraryEntityDiscoveryRow {
	file_key: string;
	username: string;
	content_fingerprint: string | null;
	status: LibraryDiscoveryStatus;
	queue_message: string | null;
	retry_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
}

export interface LibraryEntityCandidateRow {
	id: string;
	file_key: string;
	username: string;
	merge_key: string;
	entity_type: string;
	name: string;
	content: string | null;
	metadata: string | null;
	confidence: number | null;
	extraction_entity_id: string;
	id_suffix: string;
	created_at: string;
	updated_at: string;
}

export interface LibraryEntityRelationshipRow {
	id: string;
	file_key: string;
	from_extraction_entity_id: string;
	to_extraction_entity_id: string;
	relationship_type: string;
	strength: number | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
}

export class LibraryEntityDAO extends BaseDAOClass {
	async isSchemaReady(): Promise<boolean> {
		return this.hasTable("library_entity_discovery");
	}

	async upsertDiscoveryPending(
		fileKey: string,
		username: string
	): Promise<void> {
		const sql = `
      INSERT INTO library_entity_discovery (file_key, username, status, queue_message, retry_count, last_error, updated_at)
      VALUES (?, ?, 'pending', '', 0, NULL, datetime('now'))
      ON CONFLICT(file_key) DO UPDATE SET
        status = 'pending',
        queue_message = '',
        retry_count = 0,
        last_error = NULL,
        updated_at = datetime('now')
    `;
		await this.execute(sql, [fileKey, username]);
	}

	async getDiscovery(
		fileKey: string
	): Promise<LibraryEntityDiscoveryRow | null> {
		const sql = `SELECT * FROM library_entity_discovery WHERE file_key = ?`;
		return this.queryFirst<LibraryEntityDiscoveryRow>(sql, [fileKey]);
	}

	async markDiscoveryProcessing(fileKey: string): Promise<void> {
		await this.execute(
			`UPDATE library_entity_discovery SET status = 'processing', updated_at = datetime('now') WHERE file_key = ?`,
			[fileKey]
		);
	}

	async updateDiscoveryQueueMessage(
		fileKey: string,
		queueMessage: string
	): Promise<void> {
		await this.execute(
			`UPDATE library_entity_discovery SET queue_message = ?, updated_at = datetime('now') WHERE file_key = ?`,
			[queueMessage, fileKey]
		);
	}

	async markDiscoveryComplete(
		fileKey: string,
		fingerprint: string
	): Promise<void> {
		await this.execute(
			`UPDATE library_entity_discovery SET status = 'complete', content_fingerprint = ?, queue_message = NULL, last_error = NULL, completed_at = datetime('now'), updated_at = datetime('now') WHERE file_key = ?`,
			[fingerprint, fileKey]
		);
	}

	async markDiscoveryFailed(fileKey: string, error: string): Promise<void> {
		await this.execute(
			`UPDATE library_entity_discovery SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE file_key = ?`,
			[error, fileKey]
		);
	}

	async listPendingDiscovery(
		limit: number
	): Promise<LibraryEntityDiscoveryRow[]> {
		const sql = `
      SELECT * FROM library_entity_discovery
      WHERE status = 'pending'
      ORDER BY updated_at ASC
      LIMIT ?
    `;
		return this.queryAll<LibraryEntityDiscoveryRow>(sql, [limit]);
	}

	async listDiscoveryForUsername(
		username: string
	): Promise<LibraryEntityDiscoveryRow[]> {
		return this.queryAll<LibraryEntityDiscoveryRow>(
			`SELECT * FROM library_entity_discovery WHERE username = ?`,
			[username]
		);
	}

	async upsertCandidate(input: {
		id: string;
		fileKey: string;
		username: string;
		mergeKey: string;
		entityType: string;
		name: string;
		content: unknown;
		metadata: unknown;
		confidence: number | null;
		extractionEntityId: string;
		idSuffix: string;
	}): Promise<void> {
		const contentJson =
			input.content === undefined || input.content === null
				? null
				: JSON.stringify(input.content);
		const metaJson =
			input.metadata === undefined || input.metadata === null
				? null
				: JSON.stringify(input.metadata);
		const sql = `
      INSERT INTO library_entity_candidates (
        id, file_key, username, merge_key, entity_type, name, content, metadata, confidence,
        extraction_entity_id, id_suffix, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(file_key, merge_key) DO UPDATE SET
        id = excluded.id,
        entity_type = excluded.entity_type,
        name = excluded.name,
        content = excluded.content,
        metadata = excluded.metadata,
        confidence = excluded.confidence,
        extraction_entity_id = excluded.extraction_entity_id,
        id_suffix = excluded.id_suffix,
        updated_at = datetime('now')
    `;
		await this.execute(sql, [
			input.id,
			input.fileKey,
			input.username,
			input.mergeKey,
			input.entityType,
			input.name,
			contentJson,
			metaJson,
			input.confidence,
			input.extractionEntityId,
			input.idSuffix,
		]);
	}

	async upsertRelationship(input: {
		id: string;
		fileKey: string;
		fromExtractionEntityId: string;
		toExtractionEntityId: string;
		relationshipType: string;
		strength: number | null;
		metadata: unknown;
	}): Promise<void> {
		const metaJson =
			input.metadata === undefined || input.metadata === null
				? null
				: JSON.stringify(input.metadata);
		const sql = `
      INSERT INTO library_entity_relationships (
        id, file_key, from_extraction_entity_id, to_extraction_entity_id,
        relationship_type, strength, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(file_key, from_extraction_entity_id, to_extraction_entity_id, relationship_type) DO UPDATE SET
        strength = excluded.strength,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `;
		await this.execute(sql, [
			input.id,
			input.fileKey,
			input.fromExtractionEntityId,
			input.toExtractionEntityId,
			input.relationshipType,
			input.strength,
			metaJson,
		]);
	}

	async listCandidatesForFile(
		fileKey: string
	): Promise<LibraryEntityCandidateRow[]> {
		return this.queryAll<LibraryEntityCandidateRow>(
			`SELECT * FROM library_entity_candidates WHERE file_key = ? ORDER BY name ASC`,
			[fileKey]
		);
	}

	async listRelationshipsForFile(
		fileKey: string
	): Promise<LibraryEntityRelationshipRow[]> {
		return this.queryAll<LibraryEntityRelationshipRow>(
			`SELECT * FROM library_entity_relationships WHERE file_key = ?`,
			[fileKey]
		);
	}

	async deleteRelationshipsForFile(fileKey: string): Promise<void> {
		await this.execute(
			`DELETE FROM library_entity_relationships WHERE file_key = ?`,
			[fileKey]
		);
	}
}
