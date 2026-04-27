-- Remove D1 tables that are not referenced in application code.
-- Dropped: campaign_context_chunks (legacy RAG; see GRAPHRAG_INTEGRATION.md), campaign_planning_sessions (no DAO),
--          user_notifications (notifications use Durable Objects, not this table).
-- Pre-req: empty or acceptable to lose; apply with: npm run migrate:prod:apply (or scripts/d1/d1-one-time-apply-prod-drop-dead-tables.sh)

DROP TABLE IF EXISTS campaign_context_chunks;
DROP TABLE IF EXISTS campaign_planning_sessions;
DROP TABLE IF EXISTS user_notifications;
